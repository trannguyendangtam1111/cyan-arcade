package com.cyan.arcade.tcg.opening;

import java.util.List;

/**
 * One page of a player's opened packs, newest first.
 *
 * @param page zero-based page number
 */
public record OpeningHistoryResponse(List<OpeningResponse> entries, int page, int size, long totalEntries,
		int totalPages) {
}
