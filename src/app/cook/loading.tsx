// 画面遷移の直後にすぐ表示する読み込み中の枠（タップに反応していることを示す。先読みにも使われる）
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="読み込み中" className="animate-pulse">
      <div className="px-4 pb-2 pt-4">
        <div className="h-7 w-32 rounded bg-border" />
      </div>
      <div className="mx-4 mb-3 h-11 rounded-xl bg-border/70" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="mx-4 mb-3 flex gap-3 rounded-xl border border-border bg-surface p-3">
          <div className="h-16 w-16 shrink-0 rounded-lg bg-border" />
          <div className="flex-1">
            <div className="mb-2 h-5 w-2/3 rounded bg-border" />
            <div className="h-4 w-1/2 rounded bg-border/70" />
          </div>
        </div>
      ))}
    </div>
  );
}
