import sys
import unittest
from pathlib import Path

EMBEDDER_DIR = Path(__file__).resolve().parent
if str(EMBEDDER_DIR) not in sys.path:
    sys.path.insert(0, str(EMBEDDER_DIR))

import ort_config


class OrtConfigTests(unittest.TestCase):
    def _arena_enabled(self, opts):
        if hasattr(opts, "enable_cpu_mem_arena"):
            return bool(opts.enable_cpu_mem_arena)
        return True  # config-entry fallback: флаг недоступен для чтения

    def test_mem_arena_disabled_by_default(self):
        opts = ort_config.build_session_options({})
        self.assertFalse(self._arena_enabled(opts))

    def test_mem_arena_env_override(self):
        opts = ort_config.build_session_options({"EMBEDDINGS_ORT_MEM_ARENA": "1"})
        if hasattr(opts, "enable_cpu_mem_arena"):
            self.assertTrue(self._arena_enabled(opts))

    def test_threads_applied_when_positive(self):
        opts = ort_config.build_session_options({"EMBEDDINGS_ORT_THREADS": "2"})
        self.assertEqual(opts.intra_op_num_threads, 2)

    def test_threads_zero_left_default(self):
        opts = ort_config.build_session_options({"EMBEDDINGS_ORT_THREADS": "0"})
        self.assertEqual(opts.intra_op_num_threads, 0)

    def test_max_batch_default_and_override(self):
        self.assertEqual(ort_config.max_batch_size({}), 128)
        self.assertEqual(ort_config.max_batch_size({"EMBEDDINGS_MAX_BATCH": "64"}), 64)
        self.assertEqual(ort_config.max_batch_size({"EMBEDDINGS_MAX_BATCH": "junk"}), 128)
        self.assertEqual(ort_config.max_batch_size({"EMBEDDINGS_MAX_BATCH": "0"}), 1)


if __name__ == "__main__":
    unittest.main()
