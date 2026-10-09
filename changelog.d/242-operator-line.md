## 2026-10-08 (The agent reads what goes out, in the office language)

### Added

- **An operator line under outgoing text** (#242, ADR 0007 as amended, ADR 0025). The auto-reply, the suggested reply and a reply sent as suggested now show what they say in the office language, as a muted line inside the office's bubble and under the reply box. A template's line is the same template rendered in the office language, with no model call, labelled "In English" or "Bằng tiếng Việt"; a model draft's is the office-language text it was written with (#251), labelled "Translation". There is no line when the reply is already in the office language (an English office answering an English guest, or a French one answered in English), and the line under the box goes once the agent types. A reply the agent edited or typed gets no line yet: translating it with the model is a later ticket. When a manager changes the office language, each open template suggestion's line is written again in the new one.
