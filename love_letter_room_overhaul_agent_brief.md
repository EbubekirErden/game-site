# Love Letter Room Page Overhaul — Agent Implementation Brief

## 0. Context

We are overhauling the current Love Letter room page. The current UI works functionally, but the gameplay presentation is not readable enough:

- Animations are too fast and hard to follow.
- The deck is placed in the wrong visual area and does not feel connected to the game flow.
- Card effects currently feel like separate UI actions instead of happening on the table.
- Card animations should not appear in separate popups.
- Target selection and guess selection should be sequential, dynamic, and tied to the board/player areas.
- Existing card designs should be preserved and reused as the visual base.
- The final theme may move from the current dark look toward a lighter, warmer Love Letter-style table theme.

The goal is not just to “make it prettier.” The goal is to turn the room page into a proper animated card table where the user can visually understand every step of the action.

---

## 1. Product Goal

The redesigned room page should make every move feel like this:

```text
Deck -> Hand -> Center Stage -> Target / Reveal / Clash -> Discard
```

The board should explain what is happening visually. The activity log should only confirm what happened after the fact.

Target quality bar:

```text
I play a card.
The card physically moves into the table.
The table asks for exactly one decision at a time.
The target is selected from the actual player area.
The effect resolves visibly.
The card ends where the rules say it ends.
The log confirms, but the animation explains.
```

---

## 2. Current Problems

### 2.1 Animations are too fast

Existing card/deal/discard animations feel too quick. They are visually flashy but not informative. For a card game, animation must be readable before it is fast.

Recommended baseline durations:

```ts
const MOTION = {
  deal: 650,
  playToStage: 520,
  targetPulse: 800,
  revealFlip: 700,
  clash: 850,
  discard: 480,
  betweenStepsPause: 250,
};
```

### 2.2 Deck is in the wrong place

The deck should not float awkwardly inside the center board. It should be part of the player/game flow and visually act as the source of cards.

Recommended placement:

```text
Self Player Rail: [Deck] [Hand] [Discard]
```

When a card is drawn, a hidden-card ghost should fly from the deck to the receiving player’s hand.

### 2.3 Live card effects should not use popups

Static card info popups are fine for card encyclopedia/rules help. Live gameplay effects should happen inside the center stage.

Do not show Guard/Priest/Baron/King/etc. resolution in a modal/popup.

Use the table itself:

```text
Guard card moves to center
Target player area glows
Guess token appears near Guard
Opponent hidden card moves to center
Card flips if the guess is correct
Card returns hidden if the guess is wrong
```

### 2.4 Current action setup is too form-like

The current flow behaves roughly like:

```text
Select card
Open setup area
Choose target from options
Choose guess from options
Confirm
```

This should become:

```text
Click card
Card moves to center
Legal player seats glow
Click target seat
Guess UI appears in center
Pick value
Confirm
Resolution animation plays
```

---

## 3. New Layout Direction

The room should keep a three-column page structure, but the central area needs to become a real card table.

Recommended high-level layout:

```text
┌───────────────────────────────────────────────────────────────┐
│ Top Bar: Love Letter | Turn | Room Code | Spectate | Leave     │
├───────────────┬─────────────────────────────────┬─────────────┤
│ Activity /    │ Opponent Seats                   │ Chat        │
│ Players       │                                 │             │
│               │        Center Action Stage       │             │
│               │                                 │             │
│               │ Your Rail: Deck | Hand | Discard │             │
└───────────────┴─────────────────────────────────┴─────────────┘
```

Recommended central structure:

```text
main
├── opponent-row
│   ├── opponent-seat
│   ├── opponent-seat
│   └── opponent-seat
├── action-stage
│   ├── floating-card-layer
│   ├── played-card-slot
│   ├── reveal-zone
│   ├── comparison-zone
│   └── action-prompt
└── self-player-rail
    ├── deck-stack
    ├── hand-zone
    └── discard-zone
```

The center stage is reserved for live gameplay:

- Played card
- Target indicators
- Guess tokens
- Revealed cards
- Baron clashes
- Priest/Cardinal private reveal
- King card swap
- Prince discard/draw sequence

---

## 4. Component Architecture

The existing `RoomPage.tsx` is doing too much. Split it into smaller components.

Recommended structure:

```text
RoomPage
├── RoomTopBar
├── RoomLeftSidebar
│   ├── PlayerListPanel
│   ├── SpectatorListPanel
│   ├── LobbyControlsPanel
│   └── ActivityFeedPanel
├── LoveLetterTable
│   ├── OpponentRow
│   │   └── PlayerSeat
│   ├── ActionStage
│   │   ├── FloatingCardLayer
│   │   ├── PlayedCardSlot
│   │   ├── RevealZone
│   │   ├── ClashZone
│   │   ├── GuessWheel
│   │   └── ActionPrompt
│   └── SelfPlayerRail
│       ├── DeckStack
│       ├── HandZone
│       └── DiscardZone
└── RoomChat
```

Recommended hooks:

```ts
usePlayableCardFlow();
useTargetSelection();
useAnimationTimeline();
useCardZoneRegistry();
useLatestGameEvents();
```

Most important hook:

```ts
useAnimationTimeline(previousState, currentState, latestEvents);
```

This hook should convert game events/state changes into visible animation steps.

Example animation timeline:

```ts
[
  { type: "moveCard", from: "self.hand", to: "stage.played", card },
  { type: "highlightTargets", playerIds: ["p2", "p3"] },
  { type: "waitForUserTarget" },
  { type: "showGuessWheel", values: [2, 3, 4, 5, 6, 7, 8] },
  { type: "waitForGuess" },
  { type: "resolveGuardGuess", result: "miss" },
  { type: "moveCard", from: "stage.played", to: "self.discard", card },
]
```

Important principle:

```text
Game state says what happened.
Animation timeline says how the user sees it.
```

---

## 5. Play Flow State Machine

The current two-step state such as `select_card` / `setup_action` is too broad. Replace it with a more explicit flow state.

Recommended type:

```ts
type PlayFlowState =
  | { step: "idle" }
  | { step: "choosing_card" }
  | { step: "staging_card"; cardInstanceId: string }
  | { step: "choosing_target"; cardInstanceId: string; legalTargets: string[] }
  | { step: "choosing_guess"; cardInstanceId: string; targetId: string }
  | {
      step: "confirming";
      cardInstanceId: string;
      targetIds: string[];
      guessedValue?: string;
    }
  | { step: "resolving" };
```

Recommended flow:

```text
idle
-> choosing_card
-> staging_card
-> choosing_target
-> choosing_guess
-> confirming
-> resolving
-> idle
```

This lets the UI show one meaningful choice at a time.

---

## 6. Card Zone Registry

To animate cards clearly, every important area should expose a DOM rectangle.

Recommended zone names:

```ts
type CardZone =
  | "deck"
  | `player:${PlayerID}:hand`
  | `player:${PlayerID}:discard`
  | "stage:played"
  | "stage:reveal"
  | "stage:clash-left"
  | "stage:clash-right";
```

Recommended hook API:

```ts
const { registerZone, getZoneRect } = useCardZoneRegistry();
```

Usage:

```tsx
<div ref={registerZone("deck")}>
  <DeckStack count={deckCount} />
</div>

<div ref={registerZone(`player:${player.id}:hand`)}>
  <HandZone player={player} />
</div>
```

Then animations can be physical:

```ts
animateCard({
  card,
  from: getZoneRect("deck"),
  to: getZoneRect(`player:${player.id}:hand`),
  duration: 650,
});
```

Use temporary floating/ghost cards for long-distance movement instead of forcing real layout cards to travel across complex DOM regions.

---

## 7. Floating Card Layer

Add a top-level floating layer inside the table.

Purpose:

- Animate card movement from deck to hand.
- Animate hand to center stage.
- Animate reveal cards from opponent hand to center.
- Animate King swap cards crossing paths.
- Animate Prince discard/draw movement.

Recommended structure:

```tsx
<ActionStage>
  <FloatingCardLayer activeAnimations={animations} />
  <PlayedCardSlot />
  <RevealZone />
  <ClashZone />
  <ActionPrompt />
</ActionStage>
```

A flying card should be able to render face-up or face-down:

```tsx
<FlyingCard
  card={card}
  fromRect={fromRect}
  toRect={toRect}
  faceDown={true}
  duration={650}
/>
```

For opponent draws, keep the flying card hidden. For self draws, it may fly hidden and flip once it reaches the hand.

---

## 8. Player Seat Interaction

Target selection should happen by clicking player seats, not by choosing from a bottom option list.

Each `PlayerSeat` should show:

```text
Name
Token count
Status: active / protected / eliminated
Hidden hand card slot
Discard mini-stack
Current turn indicator
```

During target selection:

```text
Legal target: glowing ring + clickable cursor
Illegal target: dimmed
Protected target: shield shimmer, not clickable
Selected target: strong outline + connecting line from played card
```

Suggested classes:

```css
.player-seat.is-targetable { }
.player-seat.is-protected { }
.player-seat.is-selected-target { }
.player-seat.is-current-turn { }
.player-seat.is-eliminated { }
```

Target selection logic should reuse the existing legal target calculations, but the rendering should move to seat-level interactivity.

---

## 9. Guess UI

Guard and Bishop need value guesses. Do not show a large bottom-up option panel.

Show a compact `GuessWheel` or horizontal guess chips inside the center stage, close to the played card.

Recommended component:

```tsx
<GuessWheel
  values={guessValues}
  selectedValue={guessedValue}
  onSelect={onGuessedValueChange}
/>
```

Classic Guard should not allow value `1`. Premium mode may include different values depending on the current rules. Preserve existing value-generation logic.

Recommended visual:

```text
[2 Priest] [3 Baron] [4 Handmaid] [5 Prince] [6 King] [7 Countess] [8 Princess]
```

For Bishop, show valid Bishop values.

---

## 10. Confirm Step

Keep a small confirm step for target/guess cards. This prevents accidental misplays.

Example:

```text
Play Guard on Hard Bot 3 guessing Priest?
[Cancel] [Play]
```

This prompt should appear in the center stage near the played card, not at the bottom of the page.

For simple cards without choices, allow faster flow:

```text
Click card -> move to center -> confirm/play -> resolve
```

---

## 11. Card-Specific Animation Plans

### 11.1 Guard

Target sequence:

```text
1. Guard moves from hand to center stage.
2. Legal opponent seats glow.
3. User clicks an opponent seat.
4. Guess chips appear beside Guard.
5. User picks a value.
6. A value token slides onto or beside the Guard card.
7. Opponent hidden hand card moves into center face-down.
8. If correct:
   - card flips open
   - hit effect plays
   - opponent seat becomes eliminated
   - revealed card moves to opponent discard
9. If wrong:
   - hidden card shakes gently
   - card stays face-down
   - card slides back to opponent hand
10. Guard moves to user's discard.
```

This is the first flow to implement because it proves target selection, guessing, hidden reveal, correct/miss resolution, and discard movement.

### 11.2 Priest

```text
1. Priest moves to center.
2. Legal target seats glow.
3. User chooses target.
4. Target hidden card moves to private reveal zone.
5. Current player sees the card flip face-up.
6. Other players/spectators only see a hidden card briefly move.
7. Card flips back and returns to target hand.
8. Priest moves to discard.
```

Important: private information must remain private.

### 11.3 Baron

```text
1. Baron moves to center.
2. User chooses target.
3. User's remaining hand card and target hand card move to clash zone.
4. Cards reveal as allowed by view state.
5. Value numbers punch upward.
6. Higher card glows.
7. Lower card cracks/fades.
8. Loser is eliminated.
9. Baron moves to discard.
```

The clash should feel impactful but elegant. Avoid excessive effects.

### 11.4 Handmaid

```text
1. Handmaid moves to center.
2. Shield ring expands from the card.
3. Shield settles around the user's player area.
4. Handmaid moves to discard.
5. Player seat keeps a shield badge until protection ends.
```

The existing particle system can be extended with shield rings or shield particles.

### 11.5 Prince

```text
1. Prince moves to center.
2. Legal targets glow. Prince may target self depending on rules.
3. Target hand card moves to center.
4. Card flips if it becomes publicly discarded.
5. Target card moves to target discard.
6. A new hidden card flies from deck to target hand.
7. Prince moves to user's discard.
```

This animation makes the deck feel like an active part of the game.

### 11.6 King

```text
1. King moves to center.
2. Legal opponent targets glow.
3. User chooses target.
4. User hand card and target hand card rise face-down.
5. Cards cross paths in an arc.
6. Cards settle into opposite hands.
7. King moves to user's discard.
```

This should be one of the most satisfying animations.

### 11.7 Cardinal

```text
1. Cardinal moves to center.
2. Two valid player seats glow.
3. User selects two players.
4. Both hidden cards move to center.
5. Current player sees both cards.
6. User chooses which card goes to which player.
7. Cards cross/return to their assigned hands.
8. Cardinal moves to discard.
```

This should use the same private reveal infrastructure as Priest.

### 11.8 Princess

```text
1. Princess moves to center.
2. Card flips/reveals dramatically.
3. Red/gold danger aura plays.
4. Princess moves to discard.
5. Player seat fades into eliminated state.
```

---

## 12. Activity Feed Role

The activity feed should become secondary.

It should answer:

```text
What just happened?
```

The board animation should answer:

```text
What is happening right now?
```

Recommended behavior:

- Keep the feed compact.
- Show latest important events.
- Auto-scroll without stealing attention.
- Highlight the log row that corresponds to the current animation.
- Do not use the feed as the main explanation of gameplay.

---

## 13. Theme Direction

The current dark theme is acceptable, but a lighter Love Letter-inspired table theme would likely fit better.

Recommended palette:

```css
:root {
  --room-bg: #efe4cf;
  --table-bg: #d8b984;
  --panel-bg: rgba(255, 248, 232, 0.88);
  --panel-border: rgba(112, 74, 42, 0.22);

  --burgundy: #7a2636;
  --burgundy-deep: #4b1420;
  --gold: #c89b3c;
  --ink: #2b1d16;
  --muted-ink: #6f5b4c;

  --player-blue: #577590;
  --player-green: #6a994e;
  --player-red: #b56576;
  --player-purple: #8d6a9f;
}
```

Recommended fonts:

```css
:root {
  --font-title: "Cinzel", "Georgia", serif;
  --font-ui: "Inter", "SF Pro Text", system-ui, sans-serif;
}
```

Do not overuse decorative fantasy fonts. Headings can be royal/serif; buttons, logs, and controls should stay readable.

---

## 14. Motion Guidelines

Recommended durations:

```ts
const DURATIONS = {
  cardHover: 180,
  cardSelectLift: 220,
  cardMoveShort: 420,
  cardMoveLong: 650,
  cardFlip: 620,
  cardClash: 850,
  shieldExpand: 700,
  discardSettle: 420,
  logAnnouncement: 1600,
};
```

Recommended easing:

```ts
const EASE = [0.22, 1, 0.36, 1];
```

Use bouncy effects sparingly:

```text
Discard impact: small bounce
Wrong Guard guess: small shake
Baron clash: short impact
```

Add reduced motion support:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 1ms !important;
    transition-duration: 1ms !important;
  }
}
```

In Framer Motion:

```ts
const prefersReducedMotion = useReducedMotion();
```

If reduced motion is enabled, skip flying cards and use fades/simple state changes.

---

## 15. Data/Event Requirements

The frontend can only animate what it knows. Some effects need more detailed event payloads than a simple final state.

Potentially required animation-friendly event data:

```ts
type AnimationEvent =
  | {
      type: "guard_resolution";
      actorId: string;
      targetId: string;
      playedCard: CardInstance;
      guessedValue: number;
      targetCard?: CardInstance;
      success: boolean;
    }
  | {
      type: "baron_comparison";
      actorId: string;
      targetId: string;
      actorCard: CardInstance;
      targetCard: CardInstance;
      loserId: string;
    }
  | {
      type: "king_swap";
      actorId: string;
      targetId: string;
    }
  | {
      type: "prince_discard_draw";
      actorId: string;
      targetId: string;
      discardedCard: CardInstance;
      drewReplacement: boolean;
    };
```

If existing `state.log` or `activeEffectPresentation` does not contain enough information, do not infer everything from final state with fragile hacks. Add proper frontend-friendly events.

---

## 16. Implementation Phases

### Phase 1 — Layout Rebuild

Goal: improve structure without changing gameplay logic.

Tasks:

```text
1. Extract RoomTopBar.
2. Extract RoomLeftSidebar.
3. Extract LoveLetterTable.
4. Extract PlayerSeat.
5. Extract SelfPlayerRail.
6. Move deck from center board/top-right area to self rail.
7. Keep existing CardView and card art.
8. Remove or simplify the old giant board layout styles.
```

Acceptance criteria:

```text
- Same game still works.
- Deck appears in the correct rail.
- Opponents are shown as top seats.
- Current player is obvious.
- Hand and discard areas are visually stable.
```

### Phase 2 — Motion Primitives

Goal: make cards able to move between zones.

Tasks:

```text
1. Add CardZoneRegistry.
2. Add FloatingCardLayer.
3. Add FlyingCard.
4. Add card flip animation support.
5. Add deck-to-hand animation.
6. Add hand-to-stage animation.
7. Add stage-to-discard animation.
```

Acceptance criteria:

```text
- Draw animation is visible.
- Play animation is visible.
- Discard animation is visible.
- No popup is used for live card movement.
```

### Phase 3 — Sequential Play UI

Goal: replace the current setup-panel style interaction.

Tasks:

```text
1. Replace broad playStage with explicit PlayFlowState.
2. Move target selection to PlayerSeat clicks.
3. Move guess selection to center-stage GuessWheel.
4. Add center-stage confirm/cancel prompt.
5. Disable unrelated controls during resolving.
```

Acceptance criteria:

```text
- Guard flow happens in clear steps.
- Targetable players glow.
- Guess options appear only after target selection.
- Confirm button summarizes the selected action.
```

### Phase 4 — Effect-Specific Animations

Implement in this order:

```text
1. Guard
2. Priest
3. Baron
4. Handmaid
5. Prince
6. King
7. Cardinal
8. Princess
```

Do not try to polish every card at once. Guard + Priest + Baron are enough to prove most of the system.

### Phase 5 — Polish

Tasks:

```text
1. Light Love Letter-style theme.
2. Better table background/texture.
3. Better hover/focus states.
4. Mobile layout.
5. Reduced motion support.
6. Animation speed tuning.
7. Optional sound hooks later.
```

---

## 17. What to Keep

Keep:

```text
- Existing CardView component and card art.
- Existing card info popup for static card encyclopedia/rule details.
- Existing legal target calculation logic.
- Existing room/chat/lobby logic.
- Existing activity feed/event formatting, but make it secondary.
```

---

## 18. What to Remove or Downgrade

Remove or downgrade:

```text
- Full bottom setup panel for target/guess actions.
- Separate popup/modal for live effect resolution.
- Deck floating inside the center board corner.
- Too-fast deal/discard animations.
- Overly dominant activity feed.
- Huge all-options-visible decision UI.
```

---

## 19. First Concrete Target: Guard Flow

Implement this first as the proof-of-concept.

Desired Guard interaction:

```text
Your turn starts
↓
Deck card flies to your hand and flips
↓
Your two hand cards glow
↓
You click Guard
↓
Guard lifts and moves to center stage
↓
Other hand card dims
↓
Legal target seats glow
↓
You click Hard Bot 3
↓
A gold line connects Guard -> Hard Bot 3
↓
Guess chips appear around Guard
↓
You click “2 Priest”
↓
Center prompt says:
“Play Guard on Hard Bot 3 guessing Priest?”
[Cancel] [Play]
↓
You click Play
↓
Hidden card from Hard Bot 3 flies into center
↓
If correct:
  card flips open
  hit effect
  Hard Bot 3 eliminated
  revealed card moves to discard
If wrong:
  card shakes face-down
  card returns to Hard Bot 3 hand
↓
Guard moves to your discard
↓
Turn indicator moves to next player
```

This single flow validates:

```text
- Hand-to-stage animation
- Player-seat target selection
- Guess UI
- Confirm prompt
- Hidden opponent card movement
- Conditional reveal
- Success/miss resolution
- Stage-to-discard movement
- Turn transition readability
```

---

## 20. Final Instruction

Treat this as an interaction-system overhaul, not a CSS-only redesign.

The core deliverable is a room page where gameplay has physical continuity:

```text
Cards come from somewhere.
Cards go somewhere.
Effects happen between visible objects.
The user makes one decision at a time.
Every animation teaches the rule instead of distracting from it.
```
