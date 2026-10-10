# Curadoria aplicada — 8 de setembro de 2026

As propostas dos seis anos foram aplicadas aos 1.006 registros do SQLite original, ao JSON público e ao catálogo D1 local. 301 registros possuem review_tag = "revisão sugerida" e o motivo em review_note. No JSON os campos correspondentes são reviewTag e reviewNote.

As propostas originais foram preservadas como histórico; seu status draft_not_applied descreve a versão original do documento. Este manifesto registra a aplicação posterior.

Backups: kanji-original.sqlite, kanji-original.json e backend-before.sql. A restauração integral do backend recuperaria também o progresso da data do backup; para desfazer apenas a curadoria, usar os valores anteriores dos registros e manter as tabelas de progresso atuais.

Migrações versionadas: 0003_kanji_manual_review.sql e 0004_kanji_curated_data.sql. Nenhuma publicação remota foi realizada.

Para listar as pendências no SQLite: SELECT id, kanji, review_note FROM kanji WHERE review_tag = 'revisão sugerida';

No backend: SELECT id, character, review_note FROM kanji_catalog WHERE review_tag = 'revisão sugerida';
