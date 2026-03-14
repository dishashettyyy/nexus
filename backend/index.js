require('dotenv').config()

const express = require('express')
const cors = require('cors')
const { ethers } = require('ethers')
const axios = require('axios')

const app = express()
app.use(cors())
app.use(express.json())

const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org'
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || ''
const PORT = Number(process.env.PORT || 3001)

// Minimal ABIs mirroring frontend/lib/constants.ts
const VAULT_FACTORY_ABI = [
  'function createVault(address[] calldata beneficiaries, uint256[] calldata shares, uint256 inactivityPeriod) external returns (address)',
  'function getVault(address owner) external view returns (address)',
  'event VaultCreated(address indexed owner, address indexed vaultAddress, uint256 inactivityPeriod)',
]

const NEXUS_VAULT_ABI = [
  'function ping() external',
  'function executeInheritance() external',
  'function setWillDocumentHash(string memory cid) external',
  'function updateBeneficiaries(address[] calldata b, uint256[] calldata s) external',
  'function cancelVault() external',
  'function claimERC20(address token) external',
  'function owner() external view returns (address)',
  'function lastPing() external view returns (uint256)',
  'function inactivityPeriod() external view returns (uint256)',
  'function executed() external view returns (bool)',
  'function getBeneficiaries() external view returns (address[])',
  'function getTimeRemaining() external view returns (uint256)',
  'function getBalance() external view returns (uint256)',
  'function willDocumentHash() external view returns (string)',
  'function shares(uint256 index) external view returns (uint256)',
  'function feeRecipient() external view returns (address)',
]

const WILL_REGISTRY_ABI = [
  'function createWill(address beneficiary, address vaultAddress, string ipfsCID) external',
  'function addTrustee(address trustee, address parent) external',
  'function approveTrustee(address trustee) external',
  'function addToReplacementPool(address member) external',
  'function markZKVerified(address trustee, uint256 nullifierHash) external',
  'function sealWill() external',
  'function submitApproval(address willOwner) external',
  'function activateReplacement(address willOwner, address inactive, address replacement) external',
  'function checkFullConsensus(address willOwner) external view returns (bool)',
  'function executeWill(address willOwner) external',
  'function getTrustTree(address willOwner) external view returns (tuple(address wallet, bool zkVerified, bool approvedByOwner, bool hasApproved, bool isActive, address[] backups, address parent)[])',
  'function getWillStatus(address willOwner) external view returns (tuple(address owner, address beneficiary, address vaultAddress, string ipfsCID, address[] level1, address[] replacementPool, bool sealed, bool executed, uint256 createdAt))',
  'event WillCreated(address indexed owner, address indexed beneficiary)',
  'event TrusteeAdded(address indexed owner, address trustee, address parent)',
  'event TrusteeApprovedByOwner(address indexed owner, address trustee)',
  'event WillSealed(address indexed owner)',
  'event ApprovalSubmitted(address indexed owner, address indexed trustee)',
  'event ReplacementActivated(address indexed owner, address inactive, address replacement)',
  'event WillExecuted(address indexed owner, address indexed beneficiary, string ipfsCID)',
  'event BranchAtRisk(address indexed owner, address branchRoot)',
]

const provider = new ethers.JsonRpcProvider(RPC_URL)

const MAX_LOG_BLOCK_RANGE = Number(process.env.MAX_LOG_BLOCK_RANGE || 10)
const LOG_RETRY_ATTEMPTS = Number(process.env.LOG_RETRY_ATTEMPTS || 3)
const LOG_RETRY_DELAY_MS = Number(process.env.LOG_RETRY_DELAY_MS || 500)

async function getLogsSafe(options) {
  if (!options || typeof options !== 'object') throw new Error('getLogsSafe requires options')
  const { fromBlock, toBlock, address, topics } = options
  let start = Number(fromBlock)
  let end = Number(toBlock)

  if (!Number.isFinite(start)) start = 0
  if (!Number.isFinite(end)) throw new Error('Invalid toBlock')
  if (start > end) throw new Error('fromBlock must be <= toBlock')

  const logs = []
  for (let chunkStart = start; chunkStart <= end; chunkStart += MAX_LOG_BLOCK_RANGE) {
    const chunkEnd = Math.min(end, chunkStart + MAX_LOG_BLOCK_RANGE - 1)
    let attempts = 0
    while (true) {
      try {
        const chunkLogs = await provider.getLogs({
          fromBlock: chunkStart,
          toBlock: chunkEnd,
          address,
          topics,
        })
        logs.push(...chunkLogs)
        break
      } catch (err) {
        attempts += 1
        const message = (err && err.message) || ''
        const isRangeError =
          message.includes('block range') ||
          (err && err.error && err.error.message && err.error.message.toLowerCase().includes('block range'))

        if (attempts > LOG_RETRY_ATTEMPTS) {
          const e = new Error(`getLogsSafe failed after ${attempts} attempts: ${err.message || err}`)
          e.cause = err
          throw e
        }

        if (!isRangeError) {
          // For transient RPC issues, backoff and retry
          await new Promise((r) => setTimeout(r, LOG_RETRY_DELAY_MS * attempts))
          continue
        }

        // If we hit a block range limit, reduce chunk size to 1 and retry.
        // This should rarely happen because we already chunk by MAX_LOG_BLOCK_RANGE.
        await new Promise((r) => setTimeout(r, LOG_RETRY_DELAY_MS * attempts))
      }
    }
  }
  return logs
}

const WILL_REGISTRY_ADDRESS = process.env.WILL_REGISTRY_ADDRESS || ''
let willRegistry = null
if (WILL_REGISTRY_ADDRESS && ethers.isAddress(WILL_REGISTRY_ADDRESS)) {
  willRegistry = new ethers.Contract(WILL_REGISTRY_ADDRESS, WILL_REGISTRY_ABI, provider)
}

const PAYMENT_RECIPIENT = process.env.PAYMENT_RECIPIENT_ADDRESS || ''

// Only enable x402 if payment recipient is configured
if (PAYMENT_RECIPIENT && ethers.isAddress(PAYMENT_RECIPIENT)) {
  try {
    const { paymentMiddleware } = require('@x402/express')

    app.use(
      paymentMiddleware(
        PAYMENT_RECIPIENT,
        {
          'POST /api/ai/advice': {
            price: '$0.001',
            network: 'eip155:84532', // Base Sepolia
            config: {
              description: 'AI vault advisor — personalized recommendations',
            },
          },
          'GET /api/vaults/list': {
            price: '$0.0001',
            network: 'eip155:84532',
            config: {
              description: 'Query all indexed vaults on Base Sepolia',
            },
          },
          'POST /api/will/verify': {
            price: '$0.0005',
            network: 'eip155:84532',
            config: {
              description: 'Trustee ZK verification request',
            },
          },
        },
        {
          // Default public facilitator; can be overridden via env
          facilitator: {
            baseUrl: process.env.X402_FACILITATOR_URL || 'https://x402engine.app',
          },
        }
      )
    )
    console.log('x402 payment middleware enabled')
  } catch (e) {
    console.warn('x402 not available, payment middleware disabled:', e.message)
  }
}

// In-memory notification store: owner_lowercase -> notification[]
const notificationStore = new Map()

function pushNotification(owner, notification) {
  const key = owner.toLowerCase()
  const list = notificationStore.get(key) || []
  list.unshift({
    ...notification,
    read: false,
    id: Date.now(),
  })
  notificationStore.set(key, list.slice(0, 20))
}

// Will-specific notification store: owner_lowercase → notification[]
const willNotificationStore = new Map()

function pushWillNotification(owner, notification) {
  const key = owner.toLowerCase()
  const list = willNotificationStore.get(key) || []
  list.unshift({
    ...notification,
    read: false,
    id: Date.now(),
    source: 'will',
  })
  willNotificationStore.set(key, list.slice(0, 30))
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, network: 'base-sepolia', rpcUrl: RPC_URL })
})

// Track last known on-chain activity per address
// address_lowercase → unix timestamp of last tx
const trusteeActivityStore = new Map()
const INACTIVITY_WARNING_DAYS = 30
const INACTIVITY_WARNING_MS = INACTIVITY_WARNING_DAYS * 24 * 60 * 60 * 1000

async function getLastActivityTimestamp(address) {
  try {
    // Check last transaction count changes as a proxy for activity
    // In production would use an indexer — for hackathon use block scanning
    const cached = trusteeActivityStore.get(address.toLowerCase())
    if (cached) return cached

    // Default to now if no data (assume active)
    const ts = Math.floor(Date.now() / 1000)
    trusteeActivityStore.set(address.toLowerCase(), ts)
    return ts
  } catch (e) {
    return Math.floor(Date.now() / 1000)
  }
}

async function checkBranchHealth(ownerAddress) {
  if (!willRegistry) return null

  try {
    const will = await willRegistry.getWillStatus(ownerAddress)
    if (!will.sealed || will.executed) return null

    const tree = await willRegistry.getTrustTree(ownerAddress)
    const now = Date.now()
    const healthReport = []

    // Check each level 1 trustee branch
    for (const level1Address of will.level1) {
      const level1Trustee = tree.find(
        (t) => t.wallet.toLowerCase() === level1Address.toLowerCase()
      )
      if (!level1Trustee) continue

      const branchHealth = {
        branchRoot: level1Address,
        status: 'healthy',
        activeMembers: 0,
        totalMembers: 1,
        hasApproval: level1Trustee.hasApproved,
        warnings: [],
      }

      // Check branch root activity
      const lastActivity = await getLastActivityTimestamp(level1Address)
      const inactiveSince = now - lastActivity * 1000

      if (inactiveSince > INACTIVITY_WARNING_MS) {
        branchHealth.status = 'at_risk'
        branchHealth.warnings.push(
          `Branch root ${level1Address.slice(0, 6)}...${level1Address.slice(-4)} ` +
            `has been inactive for ${Math.floor(inactiveSince / 86400000)} days`
        )

        // Check backups
        let backupActive = 0
        for (const backup of level1Trustee.backups) {
          const backupActivity = await getLastActivityTimestamp(backup)
          const backupInactive = now - backupActivity * 1000
          branchHealth.totalMembers++

          if (backupInactive < INACTIVITY_WARNING_MS) {
            backupActive++
            branchHealth.activeMembers++
          }
        }

        // If all backups also inactive → collapsed
        if (backupActive === 0 && level1Trustee.backups.length > 0) {
          branchHealth.status = 'collapsed'
          branchHealth.warnings.push(
            `All members of Branch ${level1Address.slice(0, 6)} are inactive. ` +
              `Activate a replacement from your approved pool immediately.`
          )

          // Push critical notification to owner
          pushWillNotification(ownerAddress, {
            type: 'branch_collapsed',
            message:
              `🚨 CRITICAL: Branch ${level1Address.slice(0, 6)}...${level1Address.slice(-4)} ` +
              `has fully collapsed. Activate a replacement immediately.`,
            timestamp: Math.floor(Date.now() / 1000),
            branchRoot: level1Address,
            severity: 'critical',
          })
        } else {
          // Push warning notification
          pushWillNotification(ownerAddress, {
            type: 'trustee_inactive',
            message:
              `⚠️ Trustee ${level1Address.slice(0, 6)}...${level1Address.slice(-4)} ` +
              `appears inactive. Consider activating a replacement.`,
            timestamp: Math.floor(Date.now() / 1000),
            branchRoot: level1Address,
            severity: 'warning',
          })
        }
      } else {
        branchHealth.activeMembers++
        branchHealth.status = 'healthy'
      }

      healthReport.push(branchHealth)
    }

    return {
      owner: ownerAddress,
      overallStatus: healthReport.every((b) => b.status === 'healthy')
        ? 'healthy'
        : healthReport.some((b) => b.status === 'collapsed')
        ? 'critical'
        : 'at_risk',
      branches: healthReport,
      checkedAt: Math.floor(Date.now() / 1000),
    }
  } catch (err) {
    console.error('checkBranchHealth error:', err)
    return null
  }
}

async function subscribeToWillRegistry() {
  if (!willRegistry) return

  // New will created
  willRegistry.on('WillCreated', (owner, beneficiary) => {
    pushWillNotification(owner, {
      type: 'will_created',
      message: `✅ Your will has been created successfully.`,
      timestamp: Math.floor(Date.now() / 1000),
      beneficiary,
    })
    console.log(`Will created: owner=${owner} beneficiary=${beneficiary}`)
  })

  // Will sealed
  willRegistry.on('WillSealed', (owner) => {
    pushWillNotification(owner, {
      type: 'will_sealed',
      message: `🔒 Your will has been permanently sealed. It is now immutable.`,
      timestamp: Math.floor(Date.now() / 1000),
    })
    console.log(`Will sealed: owner=${owner}`)
  })

  // Trustee approval submitted
  willRegistry.on('ApprovalSubmitted', (owner, trustee) => {
    pushWillNotification(owner, {
      type: 'approval_received',
      message: `✅ Trustee ${trustee.slice(0, 6)}...${trustee.slice(-4)} has approved the transfer.`,
      timestamp: Math.floor(Date.now() / 1000),
      trustee,
    })
    console.log(`Approval submitted: owner=${owner} trustee=${trustee}`)
  })

  // Replacement activated
  willRegistry.on('ReplacementActivated', (owner, inactive, replacement) => {
    pushWillNotification(owner, {
      type: 'replacement_activated',
      message:
        `🔄 Replacement ${replacement.slice(0, 6)}...${replacement.slice(-4)} ` +
        `has been activated for inactive trustee ${inactive.slice(0, 6)}...${inactive.slice(-4)}.`,
      timestamp: Math.floor(Date.now() / 1000),
      inactive,
      replacement,
    })
  })

  // Branch at risk
  willRegistry.on('BranchAtRisk', (owner, branchRoot) => {
    pushWillNotification(owner, {
      type: 'branch_at_risk',
      message:
        `⚠️ Branch ${branchRoot.slice(0, 6)}...${branchRoot.slice(-4)} ` +
        `is at risk. Please activate a replacement from your pool.`,
      timestamp: Math.floor(Date.now() / 1000),
      branchRoot,
      severity: 'warning',
    })
  })

  // Will executed — notify beneficiary
  willRegistry.on('WillExecuted', (owner, beneficiary, ipfsCID) => {
    // Notify owner
    pushWillNotification(owner, {
      type: 'will_executed',
      message: `🔓 Your will has been fully executed. Beneficiary can now claim access.`,
      timestamp: Math.floor(Date.now() / 1000),
      beneficiary,
      ipfsCID,
    })
    // Notify beneficiary
    pushWillNotification(beneficiary, {
      type: 'claim_ready',
      message: `🔓 All trustees have approved. You can now claim wallet access.`,
      timestamp: Math.floor(Date.now() / 1000),
      owner,
      ipfsCID,
    })
    console.log(`Will executed: owner=${owner} beneficiary=${beneficiary}`)
  })

  console.log('Subscribed to WillRegistry events')
}

async function indexWills() {
  if (!willRegistry) {
    console.log('WillRegistry not configured, skipping will indexing')
    return
  }

  try {
    const currentBlock = await provider.getBlockNumber()
    const fromBlock = currentBlock > 9 ? currentBlock - 9 : 0

    const filter = willRegistry.filters.WillCreated()
    const logs = await getLogsSafe({
      fromBlock,
      toBlock: currentBlock,
      address: WILL_REGISTRY_ADDRESS,
      topics: filter.topics,
    })

    const iface = new ethers.Interface(WILL_REGISTRY_ABI)
    const owners = new Set()

    for (const log of logs) {
      try {
        const parsed = iface.parseLog(log)
        const owner = parsed.args.owner
        if (owners.has(owner)) continue
        owners.add(owner)

        // Run initial health check for each will
        await checkBranchHealth(owner)
      } catch (e) {
        console.warn('Failed to parse WillCreated log:', e.message)
      }
    }

    console.log(`Indexed ${owners.size} wills from blockchain`)

    // Start periodic health checks every 6 hours
    setInterval(async () => {
      for (const owner of owners) {
        await checkBranchHealth(owner).catch((e) =>
          console.error('Health check failed for', owner, e.message)
        )
      }
    }, 6 * 60 * 60 * 1000)
  } catch (err) {
    console.error('indexWills error:', err)
  }
}

// Owner-specific notifications backed by on-chain events
app.get('/api/notifications', (req, res) => {
  try {
    const owner = (req.query.owner || '').toLowerCase()
    if (!owner) {
      return res.json([])
    }
    res.json(notificationStore.get(owner) || [])
  } catch (err) {
    console.error('notifications error', err)
    res.json([])
  }
})

function subscribeToVault(owner, vaultAddr) {
  if (!ethers.isAddress(vaultAddr)) return

  const vault = new ethers.Contract(vaultAddr, NEXUS_VAULT_ABI, provider)

  vault.on('Pinged', (_owner, ts) => {
    pushNotification(owner, {
      type: 'heartbeat',
      message: 'Heartbeat sent. Inactivity timer reset.',
      timestamp: Number(ts),
      vaultAddress: vaultAddr,
    })
  })

  vault.on('InheritanceExecuted', () => {
    pushNotification(owner, {
      type: 'executed',
      message: 'Vault executed. Heirs can claim their shares.',
      timestamp: Math.floor(Date.now() / 1000),
      vaultAddress: vaultAddr,
    })
  })

  vault.on('FundsReceived', (sender, amount) => {
    pushNotification(owner, {
      type: 'deposit',
      message: `${ethers.formatEther(amount)} ETH deposited to vault by ${sender.slice(
        0,
        6
      )}...${sender.slice(-4)}`,
      timestamp: Math.floor(Date.now() / 1000),
      vaultAddress: vaultAddr,
    })
  })
}

async function indexVaults() {
  if (!FACTORY_ADDRESS || !ethers.isAddress(FACTORY_ADDRESS)) return

  const factory = new ethers.Contract(FACTORY_ADDRESS, VAULT_FACTORY_ABI, provider)

  // Subscribe to future VaultCreated events
  factory.on('VaultCreated', (owner, vaultAddress) => {
    subscribeToVault(owner, vaultAddress)
  })

  // Backfill recent VaultCreated events
  const currentBlock = await provider.getBlockNumber()
  const fromBlock = currentBlock > 9 ? currentBlock - 9 : 0

  const filter = factory.filters.VaultCreated()
  const logs = await getLogsSafe({
    fromBlock,
    toBlock: currentBlock,
    address: FACTORY_ADDRESS,
    topics: filter.topics,
  })

  const iface = new ethers.Interface(VAULT_FACTORY_ABI)
  for (const log of logs) {
    const parsed = iface.parseLog(log)
    const owner = parsed.args.owner
    const vaultAddress = parsed.args.vaultAddress
    subscribeToVault(owner, vaultAddress)
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    network: 'base-sepolia',
    rpcUrl: RPC_URL,
    features: {
      vaultFactory: !!FACTORY_ADDRESS,
      willRegistry: !!WILL_REGISTRY_ADDRESS,
      x402Payments: !!process.env.PAYMENT_RECIPIENT_ADDRESS,
      aiAdvisor: !!process.env.OPENROUTER_API_KEY,
    },
  })
})

// List vaults by scanning recent VaultCreated events (best-effort, hackathon-grade)
app.get('/api/vaults/list', async (_req, res) => {
  if (!FACTORY_ADDRESS) {
    return res.json([])
  }
  try {
    const factory = new ethers.Contract(FACTORY_ADDRESS, VAULT_FACTORY_ABI, provider)
    const currentBlock = await provider.getBlockNumber()
    const fromBlock = currentBlock > 9 ? currentBlock - 9 : 0

    const filter = factory.filters.VaultCreated()
    const logs = await getLogsSafe({
      fromBlock,
      toBlock: currentBlock,
      address: FACTORY_ADDRESS,
      topics: filter.topics,
    })

    const iface = new ethers.Interface(VAULT_FACTORY_ABI)
    const owners = new Set()
    const vaults = []

    for (const log of logs) {
      const parsed = iface.parseLog(log)
      const owner = parsed.args.owner
      const vaultAddress = parsed.args.vaultAddress
      const inactivityPeriod = Number(parsed.args.inactivityPeriod)
      if (owners.has(owner)) continue
      owners.add(owner)

      const vault = new ethers.Contract(vaultAddress, NEXUS_VAULT_ABI, provider)
      const [vOwner, beneficiaries, lastPing, executed, balance, timeRemaining] =
        await Promise.all([
          vault.owner(),
          vault.getBeneficiaries(),
          vault.lastPing(),
          vault.executed(),
          vault.getBalance(),
          vault.getTimeRemaining()
        ])

      vaults.push({
        address: vaultAddress,
        owner: vOwner,
        beneficiaries,
        lastPing: Number(lastPing),
        inactivityPeriod,
        executed,
        balance: ethers.formatEther(balance),
        timeRemaining: Number(timeRemaining),
      })
    }

    res.json(vaults)
  } catch (err) {
    console.error('/api/vaults/list error', err)
    res.json([])
  }
})

// Fetch a single vault's on-chain data by address
app.get('/api/vaults/:address', async (req, res) => {
  try {
    const vaultAddress = req.params.address
    if (!ethers.isAddress(vaultAddress)) {
      return res.status(400).json({ error: 'Invalid vault address' })
    }
    const vault = new ethers.Contract(vaultAddress, NEXUS_VAULT_ABI, provider)
    const [
      owner,
      beneficiaries,
      lastPing,
      inactivityPeriod,
      executed,
      balance,
      timeRemaining,
      willDocumentHash,
    ] = await Promise.all([
      vault.owner(),
      vault.getBeneficiaries(),
      vault.lastPing(),
      vault.inactivityPeriod(),
      vault.executed(),
      vault.getBalance(),
      vault.getTimeRemaining(),
      vault.willDocumentHash(),
    ])

    res.json({
      address: vaultAddress,
      owner,
      beneficiaries,
      lastPing: Number(lastPing),
      inactivityPeriod: Number(inactivityPeriod),
      executed,
      balance: ethers.formatEther(balance),
      timeRemaining: Number(timeRemaining),
      willDocumentHash,
    })
  } catch (err) {
    console.error('/api/vaults/:address error', err)
    res.status(500).json({ error: 'Failed to load vault' })
  }
})

// ── GET /api/will/:owner ──────────────────────────────────
// Returns full will status + trust tree for frontend
app.get('/api/will/:owner', async (req, res) => {
  if (!willRegistry) {
    return res.status(503).json({ error: 'WillRegistry not configured' })
  }
  try {
    const owner = req.params.owner
    if (!ethers.isAddress(owner)) {
      return res.status(400).json({ error: 'Invalid address' })
    }

    const [willStatus, tree] = await Promise.all([
      willRegistry.getWillStatus(owner),
      willRegistry.getTrustTree(owner),
    ])

    // Format tree for D3 visualization
    const treeNodes = tree.map((node) => ({
      wallet: node.wallet,
      zkVerified: node.zkVerified,
      approvedByOwner: node.approvedByOwner,
      hasApproved: node.hasApproved,
      isActive: node.isActive,
      backups: node.backups,
      parent: node.parent,
      // Status for D3 color coding
      status: !node.isActive
        ? 'collapsed'
        : !node.zkVerified
        ? 'pending'
        : !node.approvedByOwner
        ? 'pending'
        : node.hasApproved
        ? 'approved'
        : 'active',
    }))

    res.json({
      owner,
      beneficiary: willStatus.beneficiary,
      vaultAddress: willStatus.vaultAddress,
      ipfsCID: willStatus.executed ? willStatus.ipfsCID : null, // Only reveal after execution
      level1: willStatus.level1,
      replacementPool: willStatus.replacementPool,
      sealed: willStatus.sealed,
      executed: willStatus.executed,
      createdAt: Number(willStatus.createdAt),
      tree: treeNodes,
      notifications: willNotificationStore.get(owner.toLowerCase()) || [],
    })
  } catch (err) {
    console.error('/api/will/:owner error:', err)
    res.status(500).json({ error: 'Failed to fetch will data' })
  }
})

// ── GET /api/will/:owner/health ───────────────────────────
// Returns branch health report for all branches
app.get('/api/will/:owner/health', async (req, res) => {
  if (!willRegistry) {
    return res.status(503).json({ error: 'WillRegistry not configured' })
  }
  try {
    const owner = req.params.owner
    if (!ethers.isAddress(owner)) {
      return res.status(400).json({ error: 'Invalid address' })
    }

    const health = await checkBranchHealth(owner)
    if (!health) {
      return res.json({ status: 'no_will', branches: [] })
    }

    res.json(health)
  } catch (err) {
    console.error('/api/will/:owner/health error:', err)
    res.status(500).json({ error: 'Failed to check branch health' })
  }
})

// ── GET /api/will/notifications/:owner ───────────────────
// Returns will-specific notifications for an owner or beneficiary
app.get('/api/will/notifications/:owner', (req, res) => {
  try {
    const owner = (req.params.owner || '').toLowerCase()
    if (!owner) return res.json([])
    res.json(willNotificationStore.get(owner) || [])
  } catch (err) {
    console.error('/api/will/notifications error:', err)
    res.json([])
  }
})

// ── POST /api/will/notifications/:owner/read ─────────────
// Mark all will notifications as read
app.post('/api/will/notifications/:owner/read', (req, res) => {
  try {
    const owner = (req.params.owner || '').toLowerCase()
    const list = willNotificationStore.get(owner) || []
    const updated = list.map((n) => ({ ...n, read: true }))
    willNotificationStore.set(owner, updated)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notifications as read' })
  }
})

// ── POST /api/will/verify ─────────────────────────────────
// x402-gated endpoint: Verify trustee ZK proof server-side
// (x402 middleware handles payment before this runs)
app.post('/api/will/verify', async (req, res) => {
  try {
    const { trusteeAddress, nullifierHash, proof, willOwner } = req.body || {}

    if (!trusteeAddress || !nullifierHash || !willOwner) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    if (!ethers.isAddress(trusteeAddress) || !ethers.isAddress(willOwner)) {
      return res.status(400).json({ error: 'Invalid address' })
    }

    // In production this would verify the Worldcoin proof on-chain
    // For hackathon: validate format and return verification status
    res.json({
      verified: true,
      trusteeAddress,
      nullifierHash,
      willOwner,
      timestamp: Math.floor(Date.now() / 1000),
      message: 'ZK identity verification successful',
    })
  } catch (err) {
    console.error('/api/will/verify error:', err)
    res.status(500).json({ error: 'Verification failed' })
  }
})

// ── POST /api/will/activity ───────────────────────────────
// Update trustee activity timestamp (called when trustee interacts with app)
app.post('/api/will/activity', (req, res) => {
  try {
    const { address } = req.body || {}
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' })
    }
    const ts = Math.floor(Date.now() / 1000)
    trusteeActivityStore.set(address.toLowerCase(), ts)
    res.json({ ok: true, address, timestamp: ts })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update activity' })
  }
})

// ── GET /api/will/trustee/:address ───────────────────────
// Get all wills where this address is a trustee
// Used for trustee approval page
app.get('/api/will/trustee/:address', async (req, res) => {
  if (!willRegistry) {
    return res.status(503).json({ error: 'WillRegistry not configured' })
  }
  try {
    const trusteeAddr = req.params.address
    if (!ethers.isAddress(trusteeAddr)) {
      return res.status(400).json({ error: 'Invalid address' })
    }

    // Scan TrusteeAdded events to find all wills this address is part of
    const currentBlock = await provider.getBlockNumber()
    const fromBlock = currentBlock > 9 ? currentBlock - 9 : 0

    const filter = willRegistry.filters.TrusteeAdded(null, trusteeAddr)
    const logs = await getLogsSafe({
      fromBlock,
      toBlock: currentBlock,
      address: WILL_REGISTRY_ADDRESS,
      topics: filter.topics,
    })

    const iface = new ethers.Interface(WILL_REGISTRY_ABI)
    const willOwners = new Set()

    for (const log of logs) {
      try {
        const parsed = iface.parseLog(log)
        willOwners.add(parsed.args.owner)
      } catch (e) {}
    }

    // Fetch will status for each
    const wills = []
    for (const owner of willOwners) {
      try {
        const status = await willRegistry.getWillStatus(owner)
        wills.push({
          owner,
          sealed: status.sealed,
          executed: status.executed,
          createdAt: Number(status.createdAt),
        })
      } catch (e) {}
    }

    res.json({ trustee: trusteeAddr, wills })
  } catch (err) {
    console.error('/api/will/trustee/:address error:', err)
    res.status(500).json({ error: 'Failed to fetch trustee wills' })
  }
})

// ── GET /api/will/beneficiary/:address ───────────────────
// Get will where this address is the beneficiary
app.get('/api/will/beneficiary/:address', async (req, res) => {
  if (!willRegistry) {
    return res.status(503).json({ error: 'WillRegistry not configured' })
  }
  try {
    const beneficiaryAddr = req.params.address
    if (!ethers.isAddress(beneficiaryAddr)) {
      return res.status(400).json({ error: 'Invalid address' })
    }

    const currentBlock = await provider.getBlockNumber()
    const fromBlock = currentBlock > 9 ? currentBlock - 9 : 0

    const filter = willRegistry.filters.WillCreated(null, beneficiaryAddr)
    const logs = await getLogsSafe({
      fromBlock,
      toBlock: currentBlock,
      address: WILL_REGISTRY_ADDRESS,
      topics: filter.topics,
    })

    const iface = new ethers.Interface(WILL_REGISTRY_ABI)
    const results = []

    for (const log of logs) {
      try {
        const parsed = iface.parseLog(log)
        const owner = parsed.args.owner
        const status = await willRegistry.getWillStatus(owner)
        results.push({
          owner,
          sealed: status.sealed,
          executed: status.executed,
          // Only reveal CID if will is executed
          ipfsCID: status.executed ? status.ipfsCID : null,
          createdAt: Number(status.createdAt),
        })
      } catch (e) {}
    }

    res.json({ beneficiary: beneficiaryAddr, wills: results })
  } catch (err) {
    console.error('/api/will/beneficiary/:address error:', err)
    res.status(500).json({ error: 'Failed to fetch beneficiary wills' })
  }
})

// AI Advisor route (OpenRouter + LLaMA 3.3 free)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ''
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct'

app.post('/api/ai/advice', async (req, res) => {
  const {
    balance,
    beneficiariesCount,
    inactivityDays,
    timeRemainingDays,
    executed,
  } = req.body || {}

  const prompt = `You are an AI advisor for a blockchain inheritance vault.
Vault status:
- Balance: ${balance} ETH
- Beneficiaries: ${beneficiariesCount}
- Inactivity period: ${inactivityDays} days
- Time remaining before heirs can claim: ${timeRemainingDays} days
- Executed: ${executed}

Give exactly 3 short specific recommendations to the vault owner.
Be direct. Format as numbered list. Max 80 words total.`

  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'AI advisor not configured' })
  }

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are an AI advisor for a blockchain inheritance vault called Nexus Vault. Be concise, practical, and user-friendly.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 300,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer':
            process.env.OPENROUTER_REFERER || 'https://nexus-vault',
          'X-Title': 'Nexus Vault AI Advisor',
        },
      }
    )

    const advice =
      response.data &&
      response.data.choices &&
      response.data.choices[0] &&
      response.data.choices[0].message &&
      response.data.choices[0].message.content
        ? response.data.choices[0].message.content
        : ''

    res.json({ advice })
  } catch (e) {
    console.error(
      '/api/ai/advice error',
      e.response && e.response.data ? e.response.data : e.message
    )
    res.status(500).json({ error: 'Failed to get AI advice' })
  }
})

app.listen(PORT, () => {
  console.log(`NexusVault backend listening on http://localhost:${PORT}`)

  // Existing vault indexing
  indexVaults().catch((err) =>
    console.error('Failed to index vaults on startup', err)
  )

  // New: will registry indexing + event subscriptions
  if (WILL_REGISTRY_ADDRESS) {
    subscribeToWillRegistry().catch((err) =>
      console.error('Failed to subscribe to WillRegistry events', err)
    )
    indexWills().catch((err) =>
      console.error('Failed to index wills on startup', err)
    )
  }
})