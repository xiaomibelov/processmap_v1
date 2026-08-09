"""Маркер llm_generated регистрируется локально (в рамках diff-scope)."""
def pytest_configure(config):
    config.addinivalue_line("markers", "llm_generated: тесты, сгенерированные LLM (scripts/llm_test_generator)")
