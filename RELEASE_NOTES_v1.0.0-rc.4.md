# EventSync v1.0.0-rc.4 — Availability Painter & Account Administration

- Optional **Start fully available · erase unavailable** mode for the weekly calendar. Switch modes via the calendar toolbar. Existing users remain in the standard availability-entry mode until they opt in. Preference is saved per account in this browser.
- Eraser mode initializes displayed weeks as available (WHITE), shows painted unavailable hours in LAGOON BLUE, preserves explicitly busy overrides, and saves the calendar baseline to MySQL. Standard mode retains its original colors. **Switching to this mode changes availability for viewed weeks.**
- System administrators can change users’ public `username#number` discriminator (1–999999) without changing UUIDs; duplicate numbers are rejected.
- System administrators can permanently delete other accounts, along with their owned meetings, groups, and public events. An administrator cannot delete their own account. Audit/attendance history is anonymized when the author is deleted.
- Includes all rc.3 CI fixes and introduces Flyway migration V7.

**Release status:** Candidate; run CI and fresh-install smoke tests before marking release ready. Back up production MySQL before upgrading; user deletion is irreversible.
