// Плитка с логотипом компании. Если картинка не загружена — рисуем первую букву
// названия на фирменном цвете, как было раньше с «T». Отдельным компонентом,
// потому что это же место встречается в трёх шапках и на публичных страницах.
import { brandLetter } from "../brand.js";

export function BrandMark({ brand, size = 34, radius = 9, font = 15, style = {} }) {
  const box = {
    width: size, height: size, borderRadius: radius, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center", ...style,
  };
  if (brand?.logo) {
    return <img src={brand.logo} alt=""
      style={{ ...box, objectFit: "contain", background: "transparent" }} />;
  }
  return (
    <div style={{ ...box, background: brand?.accent || "#b8904a",
      fontWeight: 900, fontSize: font, color: "#0c0e1a" }}>
      {brandLetter(brand)}
    </div>
  );
}
