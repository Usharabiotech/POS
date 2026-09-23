// Overlay for a full-tile product image: a glossy top sheen + a dark bottom scrim so
// the white name/price stay readable on any photo. Rendered inside a tile <button>
// whose background is set to the product image.
const money = (n: number) => "₹" + n.toFixed(2);

export function ProductCover({ name, price, unit }: { name: string; price: number; unit?: string }) {
  return (
    <>
      {/* glossy sheen across the top */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/30 via-white/5 to-transparent" />
      {/* dark scrim at the bottom for text legibility */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 top-1/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
      <span className="absolute inset-x-0 bottom-0 flex flex-col items-start p-3 text-left">
        <span
          className="line-clamp-2 text-sm font-bold leading-tight text-white"
          style={{ textShadow: "0 1px 4px rgba(0,0,0,.75)" }}
        >
          {name}
        </span>
        <span
          className="text-lg font-extrabold text-white"
          style={{ textShadow: "0 1px 4px rgba(0,0,0,.75)" }}
        >
          {money(price)}{unit ? `/${unit}` : ""}
        </span>
      </span>
    </>
  );
}
