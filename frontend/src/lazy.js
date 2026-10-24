import { lazy } from 'react';

/**
 * React.lazy + 이름 있는 export 지원.
 * 새로 배포되어 예전 청크 파일이 사라졌으면(불러오기 실패) 페이지를 한 번만 새로고침해 새 index.html 을 받는다.
 */
export function lazyNamed(load, name) {
  return lazy(() =>
    load().then(
      (m) => {
        try { sessionStorage.removeItem('chunkReload'); } catch { /* 저장소 없음 */ }
        return { default: m[name] };
      },
      (err) => {
        let reloaded = false;
        try { reloaded = sessionStorage.getItem('chunkReload') === '1'; sessionStorage.setItem('chunkReload', '1'); } catch { /* 저장소 없음 */ }
        if (!reloaded) window.location.reload();
        throw err;
      },
    ),
  );
}
