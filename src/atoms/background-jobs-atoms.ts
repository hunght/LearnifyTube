/**
 * Background Jobs Atoms
 *
 * Jotai atoms for managing UI state related to background jobs.
 */

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

/**
 * IDs of jobs that have been acknowledged by the user (to avoid duplicate toasts)
 * Persisted to localStorage so toasts don't reappear on page reload
 */
export const acknowledgedJobsAtom = atomWithStorage<string[]>("acknowledged-jobs", []);

/**
 * Whether the jobs panel/popover is currently open
 */
export const jobsPanelOpenAtom = atom(false);
