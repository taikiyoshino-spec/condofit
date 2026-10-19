// 作るモードは全画面なので、読み込み中も全画面で出す
export default function Loading() {
  return (
    <div aria-busy="true" className="theme-cook fixed inset-0 z-30 flex items-center justify-center bg-bg text-muted">
      準備しています…
    </div>
  );
}
