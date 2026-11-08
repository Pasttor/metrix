"use client";

import { useSearchParams } from "next/navigation";
import { parseRange, RANGE_PARAM, type Range } from "@/lib/range";

/** Current `?range=` value. Components using it must sit inside <Suspense>. */
export function useRange(): Range {
  return parseRange(useSearchParams().get(RANGE_PARAM));
}
