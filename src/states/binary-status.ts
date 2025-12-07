import { atom } from "jotai";

type BinaryStatus = "checking" | "installing" | "ready" | "error";

export const ytDlpStatusAtom = atom<BinaryStatus>("checking");
export const ffmpegStatusAtom = atom<BinaryStatus>("checking");
