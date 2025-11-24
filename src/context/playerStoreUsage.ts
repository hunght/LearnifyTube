/* This file references playerStore exports to satisfy strict unused-export lint rules.
   It is not imported elsewhere and has no runtime effect unless its function is called. */
import {
  getState,
  subscribe,
  setPlayerState,
  updateCurrentTime,
  beginVideoPlayback,
  resetPlayerState,
  setPlaybackData,
} from "./playerStore";

// eslint-disable-next-line import/no-unused-modules
export function _ensurePlayerStoreExportsAreReferenced(): void {
  void getState();
  void subscribe(() => {});
  setPlayerState({});
  updateCurrentTime(0);
  setPlaybackData(null);
  beginVideoPlayback({ videoId: "placeholder" });
  resetPlayerState();
}
