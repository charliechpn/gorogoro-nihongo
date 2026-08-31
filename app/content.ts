export const homeCopy = {
  'pt-BR': {
    brand: 'Nihongo',
    navigation: {
      trainings: 'Treinos',
      kanjiDatabase: 'Banco de kanjis',
      progress: 'Progresso',
      community: 'Comunidade',
      languageShort: 'PT',
      languageLabel: 'Idioma atual: português',
    },
    hero: {
      eyebrow: 'ESTUDE JAPONÊS. USE O QUE APRENDE.',
      titleLine1: 'Aprenda',
      titleLine2: 'japonês',
      titleAccent: 'de verdade.',
      description:
        'Kanji e vocabulário em treinos diretos, claros e feitos para caber no seu ritmo.',
      cta: 'Começar a praticar',
      tagTranslation: 'aprender é um tesouro',
      sceneAlt: 'Jardim japonês em aquarela com um neko estudando',
    },
    modesIntro: {
      eyebrow: 'ESCOLHA COMO PRATICAR',
      title: 'Modos de estudo',
      description:
        'Cada modo ataca uma habilidade diferente e compartilha a mesma base de dados. Hoje eles estão aqui bonitos; amanhã começam a trabalhar.',
    },
    modes: [
      {
        id: 'kanji-cards',
        label: 'Kanji',
        title: 'Cards de kanji',
        description: 'Escolha um conjunto e treine significado, leitura e memória.',
        character: '漢',
        image: '/mode-kanji.png',
        detail: '1.006 kanjis escolares',
        tone: 'indigo',
      },
      {
        id: 'vocabulary',
        label: 'Vocabulário',
        title: 'Palavras em contexto',
        description: 'Descubra vocabulário comum conectado aos kanjis que você estuda.',
        character: '語',
        image: '/mode-vocabulary.png',
        detail: 'Conectado ao seu treino',
        tone: 'linen',
      },
      {
        id: 'word-game',
        label: 'Desafio',
        title: 'Cite uma palavra',
        description: 'Receba um kanji e puxe da memória palavras que usam esse caractere.',
        character: '言',
        image: '/mode-word-game.png',
        detail: 'Memória ativa',
        tone: 'linen',
      },
      {
        id: 'verb-pairs',
        label: 'Verbos',
        title: 'Transitivo × intransitivo',
        description: 'Treine pares que parecem simples até resolverem virar uma emboscada.',
        character: '動',
        image: '/mode-verbs.png',
        detail: 'Pares de verbos',
        tone: 'indigo',
      },
      {
        id: 'onomatopoeia',
        label: 'Sons',
        title: 'Onomatopeias',
        description: 'Aprenda as palavras que fazem o japonês soar vivo, estranho e ótimo.',
        character: '々',
        image: '/mode-onomatopoeia.png',
        detail: 'Som, sensação e contexto',
        tone: 'linen',
      },
    ],
    closing: {
      title: 'Uma palavra de cada vez.',
      description: 'A língua é uma ponte; o coração, uma viagem.',
    },
    footer: {
      copyright: '© 2026 Nihongo',
      note: 'Feito para quem resolveu encarar os kanjis de frente.',
    },
  },
} as const;

export const defaultLocale = 'pt-BR' as const;
