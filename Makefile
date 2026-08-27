.PHONY: openapi
openapi:
	@./scripts/update_openapi.sh

.PHONY: openapi-no-lint
openapi-no-lint:
	@./scripts/update_openapi.sh --no-lint
