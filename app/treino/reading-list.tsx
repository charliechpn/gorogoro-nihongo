/** Keep each dictionary reading intact; wrap only between alternatives. */
export default function ReadingList({ value }: { value: string | null | undefined }) {
  const readings = (value || '—').split(/[、,;；\n]+/).map(item => item.trim()).filter(Boolean);
  return <span className="training-readings">{readings.map((reading, index) =>
    <span className="training-reading" key={index}>{reading}{index < readings.length - 1 && <span className="training-reading-separator">、</span>}</span>
  )}</span>;
}
