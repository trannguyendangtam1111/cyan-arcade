package com.cyan.arcade.tcg.administration;

import com.cyan.arcade.common.security.AuthenticatedUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Uses the existing /api/admin/** role and CSRF rules; intentionally no public/UI control. */
@RestController
@RequestMapping("/api/admin/tcg/pilots/yugioh")
@PreAuthorize("hasRole('ADMIN')")
class YugiohPilotController {

	private final YugiohPilotService pilot;

	YugiohPilotController(YugiohPilotService pilot) {
		this.pilot = pilot;
	}

	record VisibilityRequest(@NotNull Boolean active) { }

	@GetMapping
	YugiohPilotService.Readiness readiness() {
		return this.pilot.readiness();
	}

	@PutMapping("/visibility")
	YugiohPilotService.Readiness visibility(@Valid @RequestBody VisibilityRequest request,
			@AuthenticationPrincipal AuthenticatedUser admin) {
		return this.pilot.setVisible(request.active(), admin.id());
	}
}
