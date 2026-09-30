// 画面遷移の直後にすぐ表示する読み込み中の枠（データ取得を待つ間も操作に反応していることを示す）
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="読み込み中" className="animate-pulse">
      <div className="px-4 pb-2 pt-4">
        <div className="h-7 w-32 rounded bg-border" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="mx-4 mb-4 rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 h-5 w-24 rounded bg-border" />
          <div className="mb-2 h-4 w-full rounded bg-border/70" />
          <div className="h-4 w-2/3 rounded bg-border/70" />
        </div>
      ))}
    </div>
  );
}
