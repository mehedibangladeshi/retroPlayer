import type { Title } from '@shared/layout'

const CAP = 0.688 // Liberation Sans cap height (em)

/** A window title in Liberation Sans whose capitals cover the measured box. The box is trimmed to cap top and
 *  baseline (.title-text), so top is the cap top. Not interactive. */
export default function TitleText({ title: t }: { title: Title }) {
  return (
    <span className="title-text app-font" aria-hidden="true"
      style={{ left: t.x, top: t.capTop, fontSize: t.capH / CAP, letterSpacing: t.spacing, color: t.color }}>
      {t.text}
    </span>
  )
}
