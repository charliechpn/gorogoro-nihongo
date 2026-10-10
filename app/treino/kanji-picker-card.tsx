import ReadingList from './reading-list';
import { useLanguage } from '../language';

type Props = {
  item: { kanji: string; meaning: string; meaningEn?: string | null; onyomi: string | null; kunyomi: string | null };
  checked: boolean;
  onChange: () => void;
};

export default function KanjiPickerCard({ item, checked, onChange }: Props) {
  const language = useLanguage();
  const meaning = language === 'pt' ? item.meaning : item.meaningEn ?? item.meaning;
  return <label className="kanji-picker-cell">
    <input type="checkbox" checked={checked} onChange={onChange} aria-label={`${language === 'pt' ? 'Selecionar' : 'Select'} ${item.kanji}: ${meaning}`} />
    <span className="kanji-picker-character" lang="ja" aria-hidden="true">{item.kanji}</span>
    <span className="kanji-picker-readings">
      <span className="kanji-picker-reading-row"><span className="kanji-picker-reading-label">Onyomi</span><span lang="ja"><ReadingList value={item.onyomi} /></span></span>
      <span className="kanji-picker-reading-row"><span className="kanji-picker-reading-label">Kunyomi</span><span lang="ja"><ReadingList value={item.kunyomi} /></span></span>
    </span>
    <span className="kanji-picker-meaning" lang={language === 'pt' ? 'pt-BR' : 'en'}>{meaning}</span>
  </label>;
}
