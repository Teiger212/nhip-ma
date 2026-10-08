## 2026-10-08 (Guest details read in the office language)

### Changed

- **The guest details read in the office language** (#243, #96, ADR 0025). Move-in reads as a phrase ("Next week", "Tuần sau"), not the guest's own words ("tuần sau", "на этой неделе"). Budget reads as an amount and a currency ("$3,000 / month", "15 million VND", "15 triệu đồng"). Nationality and beds / household read in words ("Người Nga", "3 phòng ngủ, gia đình 4 người"). One formatter turns the stored values into words when they are shown, so older threads read the same way with no migration. A value it doesn't recognise shows as the guest wrote it. The VI wording is pending #78.

### Fixed

- **Extraction slips from the demo walk** (#243). A budget at the end of a sentence no longer keeps the full stop ("$3500." is now "$3500"). "In December" and "from March" are now read as the move-in. A day the guest wants to view on ("is a viewing possible this Saturday?", "на этой неделе хотим посмотреть") is no longer read as the move-in. "Française" and "français" are now read as French. These change only stored values, and only on the guest's next message. Run `pnpm seed -- --reset` to see them on the walk office.
