# Tradução dos bancos para inglês

## Regras para cada lote

- [ ] Traduzir manualmente o sentido do japonês no contexto, usando o português como apoio, sem tradução automática em massa.
- [ ] Preservar ID, escrita japonesa, leitura, nível, classificação e todo o conteúdo em português.
- [ ] Escolher uma tradução principal curta; acrescentar sentidos secundários só quando forem úteis no jogo.
- [ ] Conferir polissemia, verbos transitivos/intransitivos, falsos cognatos e exemplos contra o japonês. Registrar dúvidas para revisão, sem inventar equivalências.
- [ ] Manter inglês natural, direto e linguisticamente neutro, no mesmo tom da interface.
- [ ] Validar contagem, IDs, campos obrigatórios e correspondência entre fonte, catálogo e banco; corrigir antes de marcar o lote como concluído.
- [ ] Revisar editorialmente o lote inteiro e testar sua apresentação na interface quando o modo estiver pronto.

## 1. Kanji — 1.006 entradas, 1.006 revisadas, 0 restantes

Cada caixa representa uma série escolar completa. Os arquivos de curadoria e as migrações podem ser separados internamente, mas a entrega de cada etapa cobre todos os kanji daquela série.

Revisão linguística inglesa dos 1.006 registros: [método, correções e limites](content/kanji/en/REVIEW.md). Cinco glosses foram corrigidos após a auditoria.

- [x] 1º ano, IDs 1–80 — 80/80.
- [x] 2º ano, IDs 81–240 — 160/160.
- [x] 3º ano, IDs 241–440 — 200/200.
- [x] 4º ano, IDs 441–640 — 200/200.
- [x] 5º ano, IDs 641–825 — 185/185.
- [x] 6º ano, IDs 826–1006 — 181/181.
- [x] Integrar a seleção do idioma às respostas e à seleção avançada do treino de kanji.

## 2. Vocabulário — 5.948 entradas

Traduzir tanto a dica principal (`promptPt`) quanto os significados aceitos (`meaningsPt`), com equivalentes em inglês ligados ao mesmo sentido japonês. Fazer lotes de até 100 entradas **na ordem do arquivo de cada nível**: há lacunas nos IDs, então não usar intervalos numéricos como medida da quantidade.

- [x] N5 — 459 entradas: pista e significados em inglês revisados; integrados às duas direções do treino.
- [x] N4 — 432 entradas: pista e significados em inglês revisados; integrados às duas direções do treino.
- [x] N3 — 1.304 entradas: pistas e significados em inglês integrados ao treino nas duas direções.
- [x] N2 — 1.201 entradas: pistas e significados em inglês integrados ao treino nas duas direções.
- [x] N1 — 2.552 entradas: pistas e significados em inglês integrados ao treino nas duas direções.
- [x] Verificar que as respostas aceitas em inglês correspondam à dica exibida e não alterem as respostas em português.
- [x] Integrar o idioma ao treino de vocabulário quando o conjunto exposto ao jogador estiver coberto.

## 3. Onomatopeias — 189 entradas

Traduzir o significado usado na pergunta e nas alternativas. Preservar termo japonês, definição japonesa e categorias.

- [x] IDs 1–50.
- [x] IDs 51–100.
- [x] IDs 101–150.
- [x] IDs 151–189.
- [x] Conferir que alternativas diferentes não acabem com a mesma tradução inglesa.
- [x] Integrar o idioma aos modos fácil e difícil após a revisão das 189 entradas.

## 4. Verbos em pares — 1.398 verbos, 1.437 exemplos

Cada entrada precisa de significado, explicação e tradução dos exemplos. Manter a classificação gramatical e conferir o uso do verbo no japonês: algumas descrições em português ou japonês do banco podem estar imprecisas. Não reproduzir um erro só para parecer fiel ao texto atual.

- [x] N5 — 103 verbos, 104 exemplos, com correções pontuais do conteúdo original e integração ao jogo em inglês.
- [x] N4 — 178 verbos, 180 exemplos, com correções do conteúdo original e integração ao jogo em inglês.
- [x] N3 — 230 verbos, 241 exemplos, com revisão das definições japonesas, correções da fonte e integração ao jogo em inglês.
- [x] N2 — 378 verbos, 385 exemplos, com revisão das definições japonesas, correções da fonte e integração ao jogo em inglês.
- [x] N1 — 509 verbos, 527 exemplos, em dez lotes de até 59; com correções pontuais da fonte e integração ao jogo em inglês.
- [x] Conferir concordância entre exemplo japonês, tradução inglesa e classificação transitivo/intransitivo/depende nos cinco níveis.
- [x] Integrar o idioma ao jogo após a cobertura completa das entradas que ele pode sortear.

## 5. Revisão de fechamento

- [x] Alternar PT/EN em cada modo e conferir perguntas, respostas, resultados, explicações e estados vazios.
- [x] Garantir que uma sessão em inglês não misture respostas em português.
- [x] Validar que a versão portuguesa permaneceu igual e que o modo claro/escuro não interfere no idioma. Exceções documentadas: correção do verbo 1390 e concordância no resumo final.
- [x] Registrar lotes concluídos aqui e avançar para o próximo da lista.

**Revisão de fechamento concluída:** [registro da revisão e validações](content/TRANSLATION_FINAL_REVIEW.md).
