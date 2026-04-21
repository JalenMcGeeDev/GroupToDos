# Product Requirements Document
## CoGoal

*Interactive goal setting, tracking, and gamification for groups*

**Version 1.0 | April 2026**
**Status: Scoping & Requirements**

---

## 1. Executive Summary

This document defines the product requirements for a cross-platform mobile application that enables groups of people—couples, friends, families, and teams—to collaboratively set, track, and achieve goals together.

The app differentiates itself through three core pillars: support for multiple goal-setting frameworks (quarterly cascading, OKRs, SMART goals, and habit tracking), a rich XP-based gamification system that drives individual accountability within group contexts, and a flexible architecture that serves diverse group types equally from day one.

The product will be built as a cross-platform mobile app using React Native or Flutter, with development outsourced to an external team. The priority is quality over speed, with no fixed deadline.

---

## 2. Product Overview

### 2.1 Problem Statement

Most goal-setting apps are designed for individuals. When groups of people share a goal—saving for a vacation, getting fit together, launching a side project—they resort to spreadsheets, group chats, or separate solo apps with no shared visibility. There is no purpose-built tool that combines structured goal frameworks, shared accountability, and gamified motivation for groups.

### 2.2 Target Audience

The app serves all group types equally from launch. The core audiences are:

- **Couples:** Shared financial goals, health goals, relationship milestones, household projects.
- **Friend Groups:** Fitness challenges, reading goals, creative projects, accountability circles.
- **Families:** Savings targets, chore systems, educational goals for kids, vacation planning.
- **Small Teams:** Side project milestones, skill development, professional development.

### 2.3 Key Design Principles

- **Individual ownership within group goals:** Every member has personal sub-goals that roll up to the shared objective.
- **Framework flexibility:** Users choose the methodology that fits their goal, not a one-size-fits-all approach.
- **Motivation through gamification:** XP, levels, badges, and rankings make progress tangible and rewarding.
- **User-controlled cadence:** Members choose how often they check in, rather than being forced into a rigid schedule.

---

## 3. Goal Frameworks

The app supports four goal-setting frameworks at launch. When a group creates a new goal, they select a framework, which determines the structure, hierarchy, and check-in patterns.

### 3.1 Quarterly Cascading Goals

The flagship framework. Users set a quarterly objective, then break it down into monthly milestones and weekly action items. Each level is trackable independently, and completion of weekly items rolls up to monthly and quarterly progress.

- **Structure:** Quarter → Month (3) → Week (4 per month, 12 total)
- **Check-in model:** Weekly sub-goals prompt regular engagement; monthly milestones serve as progress gates.
- **Best for:** Financial targets, fitness transformations, project deliverables, learning goals.

### 3.2 OKRs (Objectives & Key Results)

Users define a qualitative objective and attach 2–5 measurable key results. Each key result has a target metric and is tracked as a percentage toward completion.

- **Structure:** Objective → Key Results (2–5), each with a numeric target.
- **Check-in model:** Key results are updated as progress occurs; the objective score is the average of key result completion.
- **Best for:** Outcome-oriented goals where the "how" is flexible but the "what" is measurable.

### 3.3 SMART Goals with Milestones

Goals are defined using the SMART criteria (Specific, Measurable, Achievable, Relevant, Time-bound) and broken into sequential milestones with deadlines.

- **Structure:** Goal → Milestones (sequential, each with a due date).
- **Check-in model:** Milestones are marked complete as reached; the goal tracks how many milestones are done vs. remaining.
- **Best for:** Linear goals with clear phases, like training for a race or completing a course.

### 3.4 Habit Tracking

For goals that are about consistency rather than a single outcome. Users define daily or weekly habits and track streaks over time.

- **Structure:** Habit → Daily/Weekly repetitions tracked over a defined period.
- **Check-in model:** Simple done/not-done toggle each day or week; streak tracking provides momentum.
- **Best for:** Exercise routines, meditation, reading, hydration, journaling.

---

## 4. XP & Gamification System

Gamification is a core engagement driver. XP is tracked per individual (not per group), creating personal accountability while maintaining group visibility through rankings and leaderboards.

### 4.1 XP-Earning Actions

The following actions earn XP. Values are starting recommendations and should be tunable via backend configuration.

| Action | XP Value | Notes |
|--------|----------|-------|
| Log a completed action | +10 XP | Base reward for any progress log (workout, savings deposit, task done) |
| Check in on time | +5 XP | Bonus for checking in within the user's chosen cadence window |
| Complete a weekly sub-goal | +25 XP | Awarded when all actions under a weekly target are done |
| Encourage a teammate | +3 XP | Reaction or comment on another member's action |
| 3-day streak | +15 XP | Consecutive days with at least one logged action |
| 7-day streak | +40 XP | Full week of daily activity |
| 30-day streak | +200 XP | Major milestone; triggers badge unlock |
| Complete a monthly milestone | +75 XP | Cascading framework: all weekly goals under a month are done |
| Complete a quarterly goal | +500 XP | Major achievement; triggers celebration animation |

### 4.2 Levels & Progression

XP accumulates into levels. Each level requires progressively more XP (exponential curve). Levels unlock cosmetic features and serve as status indicators within groups.

- **Levels 1–10:** Onboarding tier. Quick progression to hook new users. Unlocks basic profile customization.
- **Levels 11–25:** Growth tier. Unlocks additional badges, custom goal themes, and reaction types.
- **Levels 26–50:** Mastery tier. Unlocks premium cosmetics, animated celebrations, and mentor status.
- **Level 50+:** Prestige tier. Visible prestige indicators, ability to create custom badges for groups.

### 4.3 Badges & Titles

Badges are earned through specific achievements, not just XP accumulation. They are displayed on user profiles and visible to group members.

- **Streak Master:** Maintain a 30-day streak.
- **Team Player:** Encourage teammates 50 times.
- **Goal Crusher:** Complete 5 quarterly goals.
- **Early Bird:** Check in within the first hour of your cadence window 10 times.
- **Framework Explorer:** Complete at least one goal in each of the four frameworks.

Additional badges should be designed during development. The badge system should be extensible via backend so new badges can be added without app updates.

### 4.4 Group Rankings

Within each group, members are ranked by XP earned during the current goal period. Rankings reset when a new goal cycle begins, keeping competition fresh. A group leaderboard is visible on the group home screen.

### 4.5 Tangible Rewards

Groups can optionally set real-world rewards tied to goal completion. When creating a goal, the group can define a reward (e.g., "Dinner at our favorite restaurant") and the conditions for earning it. The app tracks progress toward the reward and celebrates when it's unlocked.

---

## 5. Feature Specifications by Phase

### 5.1 Phase 1: MVP (Core Loop)

The minimum feature set to validate the core experience. Goal: get groups actively tracking goals together and seeing XP progress.

| Feature | Description | Priority | Complexity |
|---------|-------------|----------|------------|
| User Authentication | Email/password and social login (Google, Apple). Profile with display name and avatar. | Must Have | Low |
| Group Creation & Invites | Create groups, invite members via shareable link or contact lookup. Join/leave groups. | Must Have | Low |
| Group Types | Label groups as couple, friends, family, or custom. Affects default themes/copy. | Should Have | Low |
| Quarterly Cascading Framework | Create quarterly goals with monthly and weekly sub-goal breakdown. | Must Have | High |
| Individual Sub-goals | Members create personal sub-goals that roll up to the shared group goal. | Must Have | High |
| Action Logging | Log completed actions with optional photo/note attachments. Simple toggle for quick logging. | Must Have | Medium |
| Media Attachments | Attach photos and text notes as proof of progress when logging actions. | Should Have | Medium |
| User-Defined Check-in Cadence | Each member sets their own check-in frequency (daily, every few days, weekly). | Must Have | Medium |
| XP System (Core) | Award XP for the five defined action types. Display personal XP total and level. | Must Have | Medium |
| Group Activity Feed | Chronological feed showing member actions, completions, and milestones. | Must Have | Medium |
| Comments on Actions/Goals | Simple text comments on goal updates and logged actions for group communication. | Must Have | Low |
| Push Notifications | Reminders for check-ins, alerts when teammates log actions, milestone celebrations. | Must Have | Medium |
| Progress Dashboard | Visual overview of goal progress: sub-goal completion, group vs. individual progress bars. | Must Have | Medium |

### 5.2 Phase 2: Framework Expansion & Gamification Depth

Add the remaining three frameworks and build out the gamification system. Goal: give users framework choice and deeper engagement loops.

| Feature | Description | Priority | Complexity |
|---------|-------------|----------|------------|
| OKR Framework | Objective + Key Results with numeric targets and percentage tracking. | Must Have | High |
| SMART Goal Framework | SMART-criteria guided setup with sequential milestone tracking. | Must Have | Medium |
| Habit Tracking Framework | Daily/weekly habit tracking with streak visualization. | Must Have | Medium |
| Framework Picker | UI for selecting a framework when creating a goal, with explanations of each. | Must Have | Low |
| Badge System | Achievement badges earned through specific milestones. Displayed on profiles. | Must Have | Medium |
| Level Progression | XP-to-level curve with cosmetic unlocks at each tier. | Should Have | Medium |
| Group Leaderboard | Ranked XP display within each group, resetting per goal cycle. | Should Have | Low |
| Streak Tracking & Rewards | Visual streak counters with bonus XP at 3, 7, and 30-day marks. | Must Have | Medium |
| Tangible Rewards | Groups define real-world rewards tied to goal completion conditions. | Should Have | Low |
| Milestone Celebrations | Animated celebrations when major milestones are hit (sub-goal completion, level up). | Should Have | Medium |
| Goal History | Archive of completed goals with final stats, XP earned, and member contributions. | Should Have | Medium |

### 5.3 Phase 3: Polish, Growth & Intelligence

Refinement features that improve retention, reduce friction, and support organic growth. Goal: make the app sticky and shareable.

| Feature | Description | Priority | Complexity |
|---------|-------------|----------|------------|
| Goal Templates | Pre-built goal templates for common objectives (save $X, run a 5K, read N books). | Should Have | Medium |
| Recurring Goals | Auto-create new goal cycles when a quarter/period ends, carrying over frameworks. | Should Have | Medium |
| Analytics & Trends | Personal and group analytics: completion rates over time, streak history, XP trends. | Should Have | High |
| Notification Customization | Granular control over notification types, timing, and quiet hours. | Should Have | Medium |
| Profile Customization | Avatars, themes, display titles from badges. Cosmetics unlocked via levels. | Nice to Have | Medium |
| Onboarding Flow | Guided first-run experience: create first group, set first goal, understand XP. | Must Have | Medium |
| AI-Assisted Goal Breakdown | Suggest realistic sub-goals based on the quarterly target and group size. | Nice to Have | High |
| Custom Frameworks | Power users define their own goal hierarchy and check-in structure. | Nice to Have | High |
| Deep Linking for Invites | Shareable links that open directly to group join flow in-app. | Should Have | Medium |
| Integrations | Connect fitness trackers, finance apps, or calendars for auto-logging actions. | Nice to Have | High |

---

## 6. Core Data Model

The following outlines the key entities and their relationships. This is conceptual and should be refined during technical architecture.

### 6.1 Entity Overview

- **User:** Account identity, profile info, XP total, current level, notification preferences, check-in cadence settings.
- **Group:** Name, type (couple/friends/family/custom), member list with roles, created date, active goal count.
- **Goal:** Belongs to a group. Has a framework type, title, description, start/end dates, status, optional tangible reward.
- **Sub-Goal:** Belongs to a goal. Can be group-level (monthly milestone) or individual-level (personal weekly target). Has a parent sub-goal reference for hierarchy.
- **Action Log:** Belongs to a user and a sub-goal. Timestamped record of progress with optional media attachment. Triggers XP calculation.
- **XP Transaction:** Ledger of all XP earned. References the action type, amount, timestamp, and source (which action/streak/badge triggered it).
- **Badge:** Definition of achievement criteria. Users earn badge instances with a timestamp.
- **Comment:** Belongs to an action log or goal. Author, text, timestamp.
- **Notification:** Queued push notification with type, recipient, payload, send time, and delivery status.

### 6.2 Key Relationships

- A User belongs to many Groups; a Group has many Users (many-to-many with role).
- A Group has many Goals; a Goal belongs to one Group.
- A Goal has many Sub-Goals; Sub-Goals can be nested (parent-child for hierarchy).
- A Sub-Goal can be assigned to a specific User (individual) or to the Group (shared).
- An Action Log belongs to one User and one Sub-Goal.
- XP Transactions are append-only and reference the triggering event for auditability.

---

## 7. Technical Considerations

### 7.1 Platform & Stack

- **Mobile:** Cross-platform using React Native or Flutter. Final framework choice should be made with the development team based on their expertise.
- **Backend:** REST or GraphQL API. Recommended: Node.js/TypeScript or Python/Django. Must support real-time updates for the activity feed (WebSockets or server-sent events).
- **Database:** PostgreSQL for relational data (users, groups, goals, sub-goals). Redis for caching leaderboards, streaks, and real-time data.
- **Push Notifications:** Firebase Cloud Messaging (Android) and Apple Push Notification Service (iOS). A notification service layer should abstract both.
- **Media Storage:** Cloud storage (AWS S3 or equivalent) for photo attachments. Images should be compressed client-side before upload.
- **Authentication:** Firebase Auth or Auth0 for social login support (Google, Apple). JWT-based session management.

### 7.2 Key Technical Risks

- **Framework engine complexity:** Supporting four frameworks with different hierarchies, cadences, and progress calculations requires a well-abstracted goal model. Investing in the data model early prevents rework later.
- **XP calculation at scale:** XP triggers on every action, streak check, and sub-goal completion. This should be event-driven (queue-based) rather than synchronous to avoid blocking the UI.
- **Real-time feed:** The group activity feed needs to feel responsive. Optimistic UI updates on the client with background sync to the server is recommended.
- **Notification fatigue:** With multiple groups and frequent actions, users could be overwhelmed. Smart batching and quiet hours are essential from Phase 1.

---

## 8. Key Screens & User Flows

The following outlines the primary screens and navigation. Detailed wireframes should be produced during the design phase.

### 8.1 Primary Navigation

- **Home / Groups:** List of user's groups with active goal previews and recent activity indicators.
- **Group Detail:** Activity feed, current goal progress, leaderboard, and goal management for a specific group.
- **Goal Detail:** Full goal view with framework-specific hierarchy, sub-goal breakdown, individual assignments, and progress visualization.
- **Log Action:** Quick-entry screen for logging an action. Toggle completion, add photo/note, select which sub-goal it applies to.
- **Profile & XP:** Personal stats: XP total, level, badge collection, streak history, goal history across all groups.
- **Notifications:** Central notification hub with grouped alerts by type (reminders, teammate actions, milestones).

### 8.2 Core User Flows

**Create a Group Goal:** Select group → New Goal → Choose framework → Define objective → Break down into sub-goals (guided by framework) → Assign individual sub-goals to members → Set start/end dates → Optionally add tangible reward → Launch.

**Daily Engagement Loop:** Receive reminder notification → Open app → Log action(s) against sub-goals → See XP earned → View group feed → React/comment on teammate actions → Check streak status.

**Weekly Review:** View weekly sub-goal status → Mark complete/incomplete → See rollup impact on monthly milestone → Adjust upcoming week's targets if needed.

---

## 9. Success Metrics

The following KPIs should be tracked from launch to measure product health and guide iteration.

- **Group Activation Rate:** Percentage of created groups that set at least one goal within 48 hours.
- **Weekly Active Rate:** Percentage of group members who log at least one action per week.
- **Goal Completion Rate:** Percentage of goals that reach 100% completion across all frameworks.
- **Retention (D7 / D30):** Percentage of users returning 7 and 30 days after signup.
- **Streak Length Distribution:** Average and median streak lengths, indicating habit formation.
- **Group Size Distribution:** Tracking which group types (couple, friends, family) are most engaged to inform marketing.
- **Framework Adoption:** Which frameworks are most used and which have the highest completion rates.

---

## 10. Open Questions & Decisions

The following items require further discussion before or during development:

1. **React Native vs. Flutter:** Final framework decision should be driven by the hired team's expertise and the desired native-feel quality.
2. **XP Balancing:** XP values in this document are starting points. A balancing pass should happen during beta testing to ensure progression feels rewarding but not trivial.
3. **Monetization Strategy:** The app will launch free. Future monetization options include premium cosmetics, additional frameworks, advanced analytics, or a subscription model. This should be planned before Phase 3.
4. **Minimum Group Size Handling:** Should the app support solo use (group of one) or require at least two members? Solo use could help onboarding but dilutes the group value proposition.
5. **Moderation & Privacy:** Groups are private by default. Determine whether any public/discoverable group features are needed for Phase 3.
6. **Offline Support:** Should users be able to log actions offline with sync when connectivity returns? Important for daily-use habits but adds significant complexity.

---

## Appendix: Phase Summary

| Phase | Focus | Est. Duration | Features |
|-------|-------|---------------|----------|
| Phase 1: MVP | Core loop: auth, groups, quarterly framework, action logging, XP basics, push notifications | 3–4 months | 13 features |
| Phase 2: Expand | Remaining frameworks, full gamification (badges, levels, leaderboard), goal history | 2–3 months | 11 features |
| Phase 3: Polish | Templates, analytics, onboarding, AI suggestions, integrations, custom frameworks | 3–4 months | 10 features |

Total estimated development timeline: 8–11 months from kickoff to Phase 3 completion, assuming a dedicated team of 2–3 developers, 1 designer, and 1 product lead.
