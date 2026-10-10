# Revisão final PT/EN — 28/09/2026

## Escopo

Revisão da apresentação e da troca de idioma na home e nos cinco jogos, com sessões representativas no navegador local. A cobertura dos arquivos completos foi validada por IDs, campos obrigatórios e correspondência com os catálogos. Esta etapa verifica a integração; a revisão linguística dos lotes está registrada nas etapas anteriores.

## Correções

- Vocabulário: a seleção inicial em EN agora anuncia English nas duas direções, mesmo antes de escolher um nível.
- Cite uma palavra: o significado do kanji no resultado agora acompanha PT/EN.
- Cite uma palavra: o resumo final respeita o singular de palavra e kanji.
- Verbo 1390, 呼び止める: corrigidos o significado português, a definição japonesa e o exemplo português. O sentido é chamar alguém para fazê-lo parar, não desafiar. A correção foi registrada na curadoria e aplicada ao catálogo publicado.

## Conferência no navegador

- Home: títulos, descrições, textos alternativos, controles, rodapé e título da página em PT/EN. Idioma e dark persistem após recarregar.
- Kanji: seleção, contagem selecionada, pergunta e resposta; o mesmo cartão 石 alternou entre stone e pedra, preservando leituras e classificação.
- Vocabulário: N1 japonês → inglês e N5 inglês → japonês; resposta, troca para PT e avanço de rodada. As direções e o controle de furigana acompanharam o idioma.
- Cite uma palavra: seleção individual, pesquisa sem resultados, resposta vazia, resultado com palavra correta, resposta sem o kanji, duplicata e conclusão. O significado alternou entre one e um.
- Verbos: N1, resposta incorreta, classificação correta, explicação e exemplo nos dois idiomas.
- Onomatopeias: modo fácil com alternativas e definição em PT/EN; modo difícil com resposta digitada, definição, autoavaliação e rodada seguinte.
- Claro/dark: alternância durante respostas nos jogos sem mudar o idioma ou o conteúdo da rodada.

## Validação

- 1.006 kanji com inglês no catálogo estático e na API local.
- 5.948 entradas de vocabulário, com IDs correspondentes às fontes nos cinco níveis e sem pistas inglesas repetidas dentro de cada nível.
- 189 onomatopeias com significados ingleses únicos e campos originais preservados.
- 1.398 verbos e 1.437 exemplos com significado, explicação e exemplos ingleses completos.
- 39 testes passaram: baralho, backend de kanji e vocabulário, curadorias e lógica dos três outros jogos.
- TypeScript e lint dos arquivos de interface alterados passaram.

O português foi preservado, exceto pela correção explícita do verbo 1390 e pelo ajuste de concordância no resumo final.
