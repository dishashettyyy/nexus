You are building the frontend for "Nexus Vault" — a decentralized 
digital estate management protocol. The backend is already live at:
nexus-vault-backend-production.up.railway.app

═══════════════════════════════════════
DESIGN SYSTEM — DARK NEON AESTHETIC
═══════════════════════════════════════

VIBE: Cyberpunk meets digital legacy. Dark, premium, futuristic.
Think: a vault that holds your most important digital assets forever.
NOT: childish gradients or generic Web3 blue.

COLOR PALETTE:
- Background primary:    #0A0A0F (near black, slight blue tint)
- Background secondary:  #0F0F1A (cards, panels)
- Background tertiary:   #13131F (hover states, inputs)
- Neon cyan:             #00F5FF (primary accent, glows)
- Neon purple:           #8B5CF6 (secondary accent)
- Neon green:            #00FF88 (success, active states)
- Neon red:              #FF2D55 (danger, warnings)
- Neon yellow:           #FFD60A (caution states)
- Text primary:          #F0F0FF (near white)
- Text secondary:        #8892A4 (muted)
- Text tertiary:         #4A5568 (disabled)
- Border default:        #1E2035 (subtle borders)
- Border glow:           rgba(0, 245, 255, 0.3) (cyan glow)

TYPOGRAPHY:
- Display font: 'Space Grotesk' (headings, hero)
- Body font: 'Inter' (paragraphs, UI)
- Mono font: 'JetBrains Mono' (addresses, keys, code)
- Import from Google Fonts

EFFECTS:
- Glassmorphism cards: 
  background: rgba(15, 15, 26, 0.8)
  backdrop-filter: blur(20px)
  border: 1px solid rgba(0, 245, 255, 0.15)
  
- Neon glow on hover:
  box-shadow: 0 0 20px rgba(0, 245, 255, 0.3),
              0 0 40px rgba(0, 245, 255, 0.1)

- Neon text glow:
  text-shadow: 0 0 10px rgba(0, 245, 255, 0.8)

- Animated gradient border:
  Use conic-gradient animation for active/important cards

- Subtle grid background pattern:
  SVG grid lines, very faint, gives depth to background

- Particle effects on hero (Three.js already in project)

COMPONENTS STYLE RULES:
- Buttons: Sharp corners (border-radius: 4px), neon border + glow on hover
- Cards: Glassmorphism, subtle cyan border, lift on hover
- Inputs: Dark background, cyan border on focus, neon glow
- Badges: Pill shape, colored background with matching text
- Tables: No outer border, subtle row separators only
- Modals: Glassmorphism, backdrop blur, centered
- Toasts: Bottom right, neon left border matching type color
- Loading: Pulsing neon dots or spinning hex

═══════════════════════════════════════
EXISTING BACKEND API ENDPOINTS
═══════════════════════════════════════

Base URL: https://nexus-vault-backend-production.up.railway.app

GET  /api/health
→ { ok: true, network: 'base-sepolia', rpcUrl: string }

GET  /api/notifications?owner=0x...
→ [{ id, type, message, timestamp, read, vaultAddress }]
notification types: 'heartbeat' | 'executed' | 'deposit' | 
                    'trustee_inactive' | 'branch_collapsed' | 
                    'approval_received' | 'will_executed'

GET  /api/vaults/list
→ [{ address, owner, beneficiaries, lastPing, 
     inactivityPeriod, executed, balance, timeRemaining }]

GET  /api/vaults/:address
→ { address, owner, beneficiaries, lastPing, inactivityPeriod,
    executed, balance, timeRemaining, willDocumentHash }

POST /api/ai/advice
body: { balance, beneficiariesCount, inactivityDays, 
        timeRemainingDays, executed }
→ { advice: string } (3 numbered recommendations)

GET  /api/will/:owner
→ { will data + full trust tree structure }

GET  /api/will/:owner/health
→ [{ branch, status, activeMembers, approvalStatus }]

═══════════════════════════════════════
SMART CONTRACTS (Base Sepolia)
═══════════════════════════════════════

VaultFactory: 0x2d3C3953e37E0E6C929513e9C997C16Dd510b15c
WillRegistry: (deployed after WillRegistry.sol is built)
Chain ID: 84532
RPC: https://sepolia.base.org

═══════════════════════════════════════
COMPLETE PAGE STRUCTURE
═══════════════════════════════════════

─────────────────────────────
PAGE 1: app/page.tsx — LANDING
─────────────────────────────

HERO SECTION:
- Full viewport height
- Three.js ParticleField background (already built)
- Animated hex grid (already built)
- Center: Large glowing vault orb (Three.js VaultOrb already built)
- Headline: "Your Legacy. Secured Forever."
  (Space Grotesk, 72px, neon cyan glow)
- Subheading: "The first protocol to protect both your crypto funds 
  AND wallet access after death. Trustless. Private. Unstoppable."
  (Inter, 20px, muted white)
- Two CTA buttons:
  Primary: "Create Your Vault" → /connect (neon cyan, glowing)
  Secondary: "Learn How It Works" → scrolls to how-it-works section
- Floating stats bar below hero:
  "💀 $4B+ Lost to Inaccessible Crypto" | 
  "🔒 Zero Custody" | 
  "⚡ Powered by Base"

HOW IT WORKS SECTION:
- Dark background with subtle grid
- Section title: "Two Layers of Protection"
- Two side-by-side animated cards:

  Card 1 — LAYER 1: FUND VAULT
  Icon: vault/safe icon (neon cyan)
  Title: "Automatic Fund Distribution"
  Steps shown as timeline:
  1. Deposit ETH & tokens into your vault
  2. Ping periodically to prove you're alive
  3. If you stop — funds auto-distribute to beneficiaries
  4. 1% protocol fee, everything else to your loved ones
  Tag: "Already Live ✅"

  Card 2 — LAYER 2: KEY INHERITANCE  
  Icon: key/lock icon (neon purple)
  Title: "ZK Trust Tree Key Transfer"
  Steps shown as timeline:
  1. Encrypt your private key in your browser
  2. Build a trust tree of verified humans
  3. After death — tree must reach full consensus
  4. Beneficiary decrypts key client-side only
  Tag: "Zero Custody 🔒"

TECH STACK MARQUEE:
- Scrolling marquee of tech logos/names:
  Solidity · Base · Ethers.js · Worldcoin · 
  Fileverse · x402 · Next.js · Zero Knowledge

SECURITY SECTION:
- Title: "Security You Can Verify"
- 3 cards in a row:
  "🔐 ZK Identity" — "Trustees verified as real humans 
   via Worldcoin. Zero personal data collected."
  "🗝️ Zero Custody" — "Your private key is encrypted 
   client-side. We never see it. Ever."
  "📄 Privacy-First Storage" — "Will documents stored 
   on Fileverse/IPFS. No surveillance. No middlemen."

CTA SECTION:
- Dark card with neon border animation
- "Ready to Secure Your Legacy?"
- "Create Vault" button → /connect

FOOTER:
- Logo + tagline
- Links: Dashboard · Will · Docs · GitHub
- "Built at ETH Mumbai 2026 · Powered by Base"

─────────────────────────────
PAGE 2: app/connect/page.tsx — WALLET CONNECTION
─────────────────────────────

LAYOUT: Centered, single column, 500px max width

- Back to home link (top left)
- Nexus Vault logo (center)
- Title: "Connect Your Wallet"
- Subtitle: "You need MetaMask to interact with Nexus Vault"

STEP INDICATOR: 3 steps shown as progress
Step 1: Connect Wallet
Step 2: Switch to Base Sepolia  
Step 3: Enter App

CONNECT STATE:
- Large MetaMask fox icon
- "Connect MetaMask" button (neon cyan, full width, glowing)
- Small text: "No account? Download MetaMask →"

CONNECTED STATE (step 2):
- Green checkmark animation
- "Connected: 0x1234...5678" (mono font, cyan)
- If wrong network: Orange warning card
  "⚠️ Switch to Base Sepolia"
  "Switch Network" button → triggers MetaMask chain switch

CORRECT NETWORK (step 3):
- Green all clear
- "Enter Nexus Vault →" button → /dashboard
- Auto-redirect after 1.5 seconds

─────────────────────────────
PAGE 3: app/dashboard/page.tsx — MAIN VAULT DASHBOARD
─────────────────────────────

LAYOUT: Sidebar + main content

LEFT SIDEBAR (240px, fixed):
- Nexus Vault logo
- Connected wallet (shortened address, cyan)
- Navigation:
  🏠 Overview (active state = neon cyan left border)
  💰 My Vault (Layer 1)
  🌳 My Will (Layer 2)  
  🔔 Notifications (with unread count badge)
  ⚙️ Settings
- Bottom: Disconnect button

MAIN CONTENT — OVERVIEW TAB:

Top stats row (4 cards):
Card 1: Vault Balance
- Big number in ETH (cyan, glowing)
- USD equivalent below (muted)
- Trend arrow

Card 2: Time Remaining
- Countdown timer (large, mono font)
- Days/Hours/Mins
- Color: green if >30 days, yellow if <30, red if <7
- Progress bar showing inactivity period used

Card 3: Beneficiaries
- Count number (large)
- Avatars/address previews
- "Manage →" link

Card 4: Will Status
- "Not Created" / "Active" / "Executing" / "Complete"
- Color coded badge
- "Create Will →" link if not created

VAULT ACTIONS ROW:
- "💓 Send Heartbeat" button (neon green, glowing)
  → calls ping() on contract
  → success: green pulse animation + notification
  → shows last ping timestamp below
- "⚡ AI Advisor" button (neon purple)
  → opens slide-in panel with AI advice
  → shows 3 numbered recommendations
  → "Powered by LLaMA 3.3 via OpenRouter" attribution
  → small "⚡ $0.001 USDC via x402" badge

AI ADVISOR PANEL (slide in from right):
- Dark glassmorphism panel
- Loading: animated neon dots
- Shows 3 recommendations as numbered cards
- Each card has an icon and action suggestion
- Refresh button

VAULT DETAILS SECTION:
Two column layout:

Left — Beneficiaries Table:
- Address (mono, shortened)
- Share percentage
- ENS name if available
- Edit button

Right — Recent Activity:
- Timeline of notifications
- Icons per type:
  💓 heartbeat → cyan
  💰 deposit → green  
  ⚠️ warning → yellow
  🚨 critical → red
  ✅ approval → green
  🔓 executed → purple

BOTTOM — Transaction History:
- Table of on-chain vault interactions
- Hash (shortened, links to Basescan)
- Type, Amount, Time

─────────────────────────────
PAGE 4: app/will/create/page.tsx — WILL CREATION WIZARD
─────────────────────────────

LAYOUT: Full page, centered, max 700px wide

TOP: Step progress bar
Steps: Key → Beneficiary → Trustees → Backups → Pool → Review → Seal
Active step: neon cyan filled circle
Completed: green checkmark circle
Upcoming: grey circle

STEP 1 — SECURE YOUR KEY:
- Warning banner (red/orange):
  "⚠️ Your private key will be encrypted in your browser.
   It will NEVER be sent to our servers or stored anywhere 
   in plaintext. We cannot access it."
- Input: Password-type field "Enter Private Key"
  (mono font, dark background, cyan focus border)
- Toggle visibility button (eye icon)
- Below input: Key format validator
  (shows "✅ Valid Ethereum private key" or "❌ Invalid format")
- Beneficiary address input:
  "Who receives access to this wallet?"
  (address input with ENS resolution)
- "Encrypt & Secure →" button
  → encrypts using beneficiary public key (ethers.js)
  → uploads to IPFS via Fileverse
  → shows: "🔒 Key secured on Fileverse IPFS"
  → shows CID in mono font
  → clears key from all state immediately

STEP 2 — ADD BENEFICIARY:
- Title: "Who inherits your wallet?"
- Address input (already pre-filled from step 1)
- WorldID verification widget for beneficiary
  "Verify they're a real human →"
  → IDKitWidget opens
  → Success: "✅ Identity Verified" green badge
- "Continue →" button (only active after verification)

STEP 3 — LEVEL 1 TRUSTEES:
- Title: "Who do you trust to approve this transfer?"
- Subtitle: "ALL of these people must approve. Choose wisely."
- Add trustee cards (2-5 trustees):
  Each card:
  - Address input
  - "Send Verification Request" button
  - WorldID status badge (pending/verified)
  - "Approve This Trustee ✓" button (after verification)
  - Remove button
- "+ Add Trustee" button (max 5)
- Visual: Mini trust tree preview updates in real time
  as trustees are added
- "Continue →" (active when min 2 trustees verified + approved)

STEP 4 — ADD BACKUPS:
- Title: "Assign backups for each trustee"
- Subtitle: "If a trustee becomes inactive, their backups step in.
             You must approve ALL backups."
- For each Level 1 trustee — expandable section:
  Trustee name/address (header)
  Add 2 backup addresses
  Each backup: WorldID verify + owner approve
  Status: "2/2 backups approved ✅"
- Progress indicator: "3/3 trustees have backups ✅"

STEP 5 — REPLACEMENT POOL:
- Title: "Pre-approved replacements"
- Subtitle: "If anyone in your trust tree becomes permanently 
             inactive, replacements can ONLY come from this pool.
             You are approving them NOW while you're alive."
- Add 3-5 pool members
- Each: address + WorldID verify + approve
- Pool size counter: "4 members in pool ✅"

STEP 6 — REVIEW:
- Full D3.js trust tree visualization (interactive)
  Owner at top
  Level 1 trustees below
  Backups below each trustee
  Pool members shown separately
  All nodes green (verified + approved)
- Summary table:
  Beneficiary | Trust Tree Size | Pool Size | IPFS CID
- Fileverse document preview:
  "📄 Will document created on Fileverse"
  Shows document title, creation time
  "View Document →" link

STEP 7 — SEAL WILL:
- Big warning card (red border, dark background):
  "⚠️ THIS ACTION IS PERMANENT AND IRREVERSIBLE"
  "Once sealed, your will cannot be modified."
  "Your trust tree is locked forever."
  "Make sure everything is correct."
- Checkbox: "I understand this cannot be undone"
- Type-to-confirm: Type "SEAL MY WILL" to enable button
- "🔒 Seal Will Forever" button (red, only active after typing)
- After sealing: Full screen success animation
  Vault door closing animation (CSS/Lottie)
  "✅ Your will is sealed and secured forever"
  Confetti burst
  CID shown in large mono font
  "View My Will Dashboard →" button

─────────────────────────────
PAGE 5: app/will/dashboard/page.tsx — WILL STATUS
─────────────────────────────

LAYOUT: Same sidebar as main dashboard

TOP STATUS BANNER:
- "🟢 Will Active — All branches healthy" (green)
- OR "🟡 Warning — Branch B at risk" (yellow)
- OR "🔴 Critical — Branch collapsed" (red)
- OR "🔓 Executing — Awaiting approvals" (purple pulse)

MAIN SECTION — TRUST TREE VISUALIZER:
- Large D3.js force-directed graph (full width, ~500px height)
- Dark background with subtle grid
- Nodes:
  Owner: Large neon cyan pulsing circle (center top)
  Level 1: Medium neon purple circles
  Backups: Smaller circles connected to parent
  Pool: Dashed border circles (separate cluster)
  Beneficiary: Large neon green circle (bottom)
- Lines between nodes:
  Active connection: neon cyan animated dashed line
  Collapsed branch: red line
  Approved: green solid line
- Click any node → tooltip shows:
  Address (mono)
  Verification status
  Last on-chain activity
  Approval status
  "Activate Replacement" button if inactive
- Legend below graph

BRANCH HEALTH CARDS:
3 cards in a row (one per Level 1 trustee):
Card per branch:
- Trustee address (shortened, mono)
- Status badge: Healthy / At Risk / Collapsed
- "Last active: X days ago"
- Backups: "2/2 active"
- Approval: "✅ Approved" / "⏳ Pending" / "❌ Inactive"
- If at risk: "Activate Replacement →" button

APPROVAL PROGRESS:
- Title: "Consensus Progress"
- Progress bar showing X/total branches approved
- Individual branch approval indicators
- "All approved → Will executes" label at 100%

WILL DETAILS SECTION:
- IPFS CID (mono, copy button)
- Fileverse document link: "📄 View Will Document →"
- Beneficiary address
- Creation date
- Vault linked (Layer 1 vault address)

─────────────────────────────
PAGE 6: app/will/approve/[willId]/page.tsx — TRUSTEE APPROVAL
─────────────────────────────

LAYOUT: Centered, 600px max width

- Title: "You've Been Asked to Be a Guardian"
- Subtitle: "Review and approve the transfer of wallet access"

WILL SUMMARY CARD:
- Owner address (mono)
- Beneficiary address (mono)
- Your role: "Level 1 Trustee" / "Backup Trustee"
- Your backups assigned to you
- "View Will Document" → fetches from Fileverse

VERIFICATION STATUS:
- If not verified: WorldID widget
  "Verify your identity to proceed"
- If verified: "✅ Identity verified" green badge

APPROVAL SECTION:
- Other branches status:
  "Branch B: ✅ Approved"
  "Branch C: ⏳ Waiting for you"
  "Branch D: ✅ Approved"
- Big "✅ Approve Transfer" button (neon green, glowing)
  → calls submitApproval() on contract
  → success animation: checkmark burst
  → "Your approval has been recorded on-chain"

TRUSTEE ACKNOWLEDGMENT (Fileverse):
- Text area: "Add a note to the will document (optional)"
  "This is stored privately on Fileverse IPFS"
- "Save Note →" button

─────────────────────────────
PAGE 7: app/will/claim/[willId]/page.tsx — BENEFICIARY CLAIM
─────────────────────────────

LAYOUT: Centered, 600px max width

LOCKED STATE (will not yet executed):
- Lock icon (large, neon red)
- "Will Not Yet Executed"
- Shows which branches still need to approve
- Progress bar: "2/3 branches approved"
- "You will be notified when all approvals are complete"

UNLOCKED STATE (will executed):
- Unlock animation (lock opening, neon green)
- "All Guardians Have Approved ✅"
- "You may now claim access to this wallet"

SECURITY CHECKLIST:
Before showing key, show checklist:
☑️ "I understand this private key controls the entire wallet"
☑️ "I will store this securely immediately"
☑️ "I will never share this with anyone"
☑️ "I understand this will only be shown once"
All must be checked to proceed.

DECRYPT SECTION:
- "🔓 Decrypt Private Key" button (neon green, large, glowing)
  → triggers MetaMask signature (derive decryption key)
  → decrypts locally using AES-256-GCM
  → shows key in mono font box

REVEALED KEY:
- Dark box with neon green border
- Private key in mono font (blurred initially)
- "👁 Reveal" button to unblur
- Copy to clipboard button
- Auto-hide countdown: "Hidden in: 60s" (ticking down)
- After 60s: key is hidden, refresh required
- Warning banner: "⚠️ This was your only chance to copy this key"

─────────────────────────────
PAGE 8: app/vault/[address]/page.tsx — PUBLIC VAULT VIEW
─────────────────────────────

LAYOUT: Centered, clean

For beneficiaries to view a specific vault:
- Vault address (hero, mono font, large)
- Status badge: Active / Claimable / Executed
- Balance in ETH
- Time remaining countdown
- Beneficiaries list with shares
- "Execute Inheritance" button 
  (only active when timeRemaining = 0 and not executed)
  → calls executeInheritance() on contract
  → success: confetti + "Funds distributed!"

═══════════════════════════════════════
SHARED COMPONENTS
═══════════════════════════════════════

components/global/Navbar.tsx (UPDATE existing):
- Logo: "⬡ NEXUS VAULT" (neon cyan, hex icon)
- Desktop nav links:
  "Vault" → /dashboard
  "Will" → /will/dashboard  
  "Create Will" → /will/create
- Right side:
  If connected: 
    Neon badge showing shortened address
    Network indicator (green dot = Base Sepolia)
    Notification bell with unread count
    Disconnect button
  If not connected:
    "Connect Wallet" button (neon cyan)

components/ui/NeonButton.tsx:
variants: primary (cyan) | secondary (purple) | 
          danger (red) | success (green) | ghost
sizes: sm | md | lg
Always: sharp corners, glow on hover, 
        loading spinner state, disabled state

components/ui/GlassCard.tsx:
- Glassmorphism card
- Optional: neon border color prop
- Optional: hover lift effect
- Optional: animated gradient border

components/ui/AddressDisplay.tsx:
- Shows shortened address (0x1234...5678)
- Copy to clipboard on click
- ENS resolution if available
- Mono font, cyan color

components/ui/CountdownTimer.tsx:
- Shows days, hours, minutes, seconds
- Color changes: green → yellow → red as time decreases
- Pulsing animation when < 24 hours

components/ui/StatusBadge.tsx:
variants: active | warning | critical | 
          pending | success | executed
Color coded with matching neon colors

components/ui/NotificationToast.tsx:
- Bottom right position
- Left border color = notification type color
- Auto dismiss after 5s
- Stack multiple toasts

components/will/TrustTreeVisualizer.tsx:
- D3.js force-directed graph
- Props: treeData, mode ('create'|'view'|'approve')
- Interactive nodes with tooltips
- Animated edges
- Color coded by health status
- Responsive (fits container width)

components/will/WorldIDVerification.tsx:
- IDKitWidget wrapper
- Props: address, willOwner, onSuccess
- Shows button → modal → success state
- Green verified badge on success

components/will/BranchHealthCard.tsx:
- Single branch health display
- Address, status, last active, backups, approval

components/will/EncryptKeyForm.tsx:
- Private key input (password type)
- Visibility toggle
- Validation indicator
- Encrypt button
- Clears state after encryption

═══════════════════════════════════════
ANIMATIONS & MICRO-INTERACTIONS
═══════════════════════════════════════

Use Framer Motion for all animations:
npm install framer-motion

- Page transitions: fade + slight upward slide
- Card hover: subtle lift (translateY -4px) + glow increase
- Button press: scale down (0.97) on click
- Success actions: scale up burst + green glow pulse
- Notifications: slide in from right
- Heartbeat button: pulse ring animation on click
- Trust tree nodes: spring animation on add/remove
- Countdown timer: color transition animation
- Vault orb: continuous slow rotation (Three.js)
- Loading states: neon dot pulse animation
- Number changes: count-up animation

═══════════════════════════════════════
WALLET & BLOCKCHAIN INTEGRATION
═══════════════════════════════════════

Use existing hooks (already built):
- useWallet() → account, signer, connectWallet etc.
- useVault(vaultAddress) → vault data
- useVaultAddress(ownerAddress) → find vault by owner

Add new hooks:

hooks/useWill.ts:
- useWill(ownerAddress) → will data from contract
- useWillHealth(ownerAddress) → branch health from backend
- useWillApprovals(willId) → approval status per branch

hooks/useNotifications.ts:
- Polls /api/notifications every 30 seconds
- Returns unread count + notification list
- markAsRead() function

hooks/usePayment.ts (x402):
- Wraps fetch with x402 payment capability
- Uses signer from useWallet
- Returns payFetch function to use instead of fetch

═══════════════════════════════════════
ENVIRONMENT VARIABLES
═══════════════════════════════════════

NEXT_PUBLIC_FACTORY_ADDRESS=0x2d3C3953e37E0E6C929513e9C997C16Dd510b15c
NEXT_PUBLIC_WILL_REGISTRY_ADDRESS=0x... (after deploy)
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_BACKEND_URL=https://nexus-vault-backend-production.up.railway.app
NEXT_PUBLIC_WORLDCOIN_APP_ID=app_... (from developer.worldcoin.org)
NEXT_PUBLIC_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e

═══════════════════════════════════════
BUILD ORDER FOR CURSOR
═══════════════════════════════════════

Build in this exact order, one at a time:

1.  globals.css → design tokens, fonts, base styles
2.  components/ui/NeonButton.tsx
3.  components/ui/GlassCard.tsx
4.  components/ui/AddressDisplay.tsx
5.  components/ui/StatusBadge.tsx
6.  components/ui/CountdownTimer.tsx
7.  components/global/Navbar.tsx (update existing)
8.  hooks/useNotifications.ts
9.  hooks/useWill.ts
10. app/page.tsx (landing — full redesign)
11. app/connect/page.tsx
12. app/dashboard/page.tsx
13. components/will/TrustTreeVisualizer.tsx (D3.js)
14. components/will/WorldIDVerification.tsx
15. components/will/EncryptKeyForm.tsx
16. components/will/BranchHealthCard.tsx
17. app/will/create/page.tsx (wizard)
18. app/will/dashboard/page.tsx
19. app/will/approve/[willId]/page.tsx
20. app/will/claim/[willId]/page.tsx
21. app/vault/[address]/page.tsx

═══════════════════════════════════════
ABSOLUTE RULES
═══════════════════════════════════════

1. Dark neon aesthetic THROUGHOUT — no light mode
2. Every page must be mobile responsive
3. Never show full private key without security checklist
4. Clear private key from state immediately after encryption
5. All blockchain calls show loading + error states
6. Wrong network → always show switch network prompt
7. Not connected → redirect to /connect
8. Use JetBrains Mono for ALL addresses and keys
9. Use Framer Motion for ALL animations
10. Use existing useWallet and useVault hooks
11. TypeScript strict — no 'any' types
12. All cards use GlassCard component
13. All buttons use NeonButton component
14. Never hardcode colors — use CSS variables
15. Show transaction hash with Basescan link after 
    every on-chain action
