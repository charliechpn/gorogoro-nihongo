import ReadingList from '../reading-list';
import TrainingFlow from '../training-flow';
import SiteHeader from '@/app/site-header';
import { useEffect, useRef } from 'react';
import type { KanjiRecord, KanjiSessionView } from './contracts';
import type { AnswerResult } from './deck';
import styles from './practice-session.module.css';
import ThemeArt from '@/app/theme-art';
import { useLanguage, useText } from '@/app/language';

type Props = {
  session: KanjiSessionView;
  kanji: KanjiRecord;
  revealed: boolean;
  busy: boolean;
  error: string;
  onReveal: () => void;
  onAnswer: (result: AnswerResult) => void;
  onLeave: () => void;
};

export default function PracticeSession({ session, kanji, revealed, busy, error, onReveal, onAnswer, onLeave }: Props) {
  const t = useText();
  const language = useLanguage();
  const actionRef = useRef<HTMLButtonElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    actionRef.current?.focus({ preventScroll: true });
  }, [revealed, session.turn]);

  return (
    <main className={styles.page}>
      <SiteHeader homeLink onChangeSet={onLeave} changeSetDisabled={busy} /><TrainingFlow step={session.turn} revealed={revealed} />

      <div className={styles.scenery} aria-hidden="true">
        <ThemeArt className={styles.garden} data-scenery="garden" src="/kanji-assets/practice-garden.png" darkSrc="/kanji-assets/practice-garden-dark.webp" alt="" />
        <ThemeArt className={styles.mountains} src="/kanji-assets/practice-mountains.png" darkSrc="/kanji-assets/practice-mountains-dark.webp" alt="" />
        <ThemeArt className={styles.inscription} src="/kanji-assets/practice-inscription.png" darkSrc="/kanji-assets/practice-inscription-dark.webp" alt="" />
        <ThemeArt className={styles.brush} src="/kanji-assets/practice-brush.png" darkSrc="/kanji-assets/practice-brush-dark.webp" alt="" />
      </div>

      <section className={styles.practice} aria-label={t('Treino de kanji', 'Kanji practice')}>

        <div className={styles.context}>
          <h1>Kanji <span aria-hidden="true">·</span> {session.grouping === 'grade' ? t('Série escolar', 'School grade') : 'JLPT'} <span aria-hidden="true">·</span> {session.grouping === 'grade' ? t(session.level + 'º ano', 'Grade ' + session.level) : session.level}</h1>
          <div className={styles.sessionStats}>
            <span className={styles.selectedCount}>{t(`${session.selectedCount} kanjis selecionados`, `${session.selectedCount} kanji selected`)}</span>
            <span aria-hidden="true">·</span>
            <span className={styles.turn}>{t('Turno', 'Round')} {session.turn}</span>
          </div>
        </div>

        <div className={revealed ? styles.studyLayout + ' ' + styles.studyLayoutRevealed : styles.studyLayout}>
          <div className={styles.cardSize}>
            <div className={styles.card}>
              <ThemeArt className={styles.cardArt} src="/kanji-assets/practice-card.png" darkSrc="/kanji-assets/practice-card-dark.webp" alt="" aria-hidden="true" />
              <div className={styles.cardContent}>
                <span className={styles.character} lang="ja">{kanji.kanji}</span>
              </div>
            </div>
          </div>
          {revealed && <div className={styles.answer} aria-live="polite" aria-atomic="true">
            <p className={styles.translation} data-training-answer lang={language === 'pt' ? 'pt-BR' : 'en'}>{language === 'pt' ? kanji.meaning : kanji.meaningEn ?? kanji.meaning}</p>
            <dl className={styles.readings}>
              <div><dt>Onyomi</dt><dd lang="ja"><ReadingList value={kanji.onyomi} /></dd></div>
              <div><dt>Kunyomi</dt><dd lang="ja"><ReadingList value={kanji.kunyomi} /></dd></div>
            </dl>
            <small className={styles.classification}>{kanji.jlpt ?? t('Sem JLPT', 'No JLPT level')} · {t(kanji.grade + 'º ano', 'Grade ' + kanji.grade)}</small>
          </div>}
        </div>

        <div className={styles.actions} aria-busy={busy}>
          {revealed ? <>
            <button ref={actionRef} className={styles.correct} disabled={busy} type="button" onClick={() => onAnswer('correct')}><span aria-hidden="true">✓</span> {t('Acertei', 'Got it')}</button>
            <button className={styles.wrong} disabled={busy} type="button" onClick={() => onAnswer('wrong')}><span aria-hidden="true">×</span> {t('Errei', 'Missed it')}</button>
          </> : <button ref={actionRef} className={styles.reveal} type="button" onClick={onReveal}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
            {t('Revelar resposta', 'Reveal answer')}
          </button>}
        </div>
        <div className={styles.status}>
          {busy && <p role="status">{t('Salvando resposta…', 'Saving answer…')}</p>}
          {error && <p role="alert">{error}</p>}
        </div>
      </section>
    </main>
  );
}
