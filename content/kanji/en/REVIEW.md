# Revisão linguística dos significados ingleses — 2026-09-27

## Escopo e método

- Foram lidas as 1.006 linhas inglesas, ID por ID, junto com o kanji e o significado português.
- A base portuguesa foi confrontada com as seis revisões japonesas individuais em `content/kanji-review/grade-1` a `grade-6`. Os 1.006 IDs, caracteres e significados propostos coincidem com o catálogo atual. O validador verifica isso continuamente.
- Foram inspecionadas separadamente as 38 linhas em que o número de segmentos separados por ponto e vírgula difere entre português e inglês. As diferenças são fusões de sinônimos ou desdobramentos úteis, não sentidos deixados sem tradução.
- Para sentidos que poderiam induzir interpretação errada, as decisões abaixo também foram conferidas no dicionário japonês Kanjipedia. Isso não significa que cada um dos 1.006 kanji tenha recebido uma consulta externa individual.
- A revisão trata dos significados ingleses. Leituras, níveis JLPT e decisões pendentes nos arquivos de revisão japonesa não foram reavaliados aqui.

## Correções aplicadas

| ID | Kanji | Antes | Depois | Motivo |
| --- | --- | --- | --- | --- |
| 241 | 丁 | `city block; counting unit` | `address block; counting unit` | O uso de 丁目 é uma divisão de endereço, não necessariamente um quarteirão físico. [Kanjipedia](https://www.kanjipedia.jp/kanji/0004774700) |
| 385 | 第 | `ordinal prefix; order number` | `ordinal prefix; order` | `order number` não é um gloss natural; 第 marca a ordem em 第一, 第二 etc. [Kanjipedia](https://www.kanjipedia.jp/kanji/0004511400) |
| 651 | 俵 | `straw bale for grain` | `straw sack for grain` | 俵 é um saco de palha tecido para guardar grãos; `bale` descrevia o objeto errado. [Kanjipedia](https://www.kanjipedia.jp/kotoba/0005936900) |
| 821 | 非 | `not; negation; error` | `not; negation; fault` | O sentido de あやまち é falta/erro de conduta; `error` sugeria um erro técnico genérico. [Kanjipedia](https://www.kanjipedia.jp/kanji/0005809100) |
| 1000 | 陛 | `Majesty; steps to the throne` | `steps to the throne; Your Majesty (in compounds)` | Os degraus do trono são o sentido do caractere; o tratamento aparece em 陛下. [Kanjipedia](https://www.kanjipedia.jp/kanji/0006212000) |

Os 1.001 glosses restantes foram mantidos após a comparação com a base japonesa revisada. As cinco alterações estão na migração `0014_kanji_english_editorial_review.sql`; as migrações anteriores permanecem intactas.
