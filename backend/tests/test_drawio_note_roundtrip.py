import os
import tempfile
import unittest


class DrawioNoteRoundtripTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.prev_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        from app._legacy_main import _normalize_drawio_meta

        self.normalize = _normalize_drawio_meta

    def tearDown(self):
        if self.prev_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.prev_storage_dir
        self.tmp.cleanup()

    def _normalize_row(self, row):
        out = self.normalize({
            "enabled": True,
            "drawio_layers_v1": [{"id": "DL1", "name": "Default", "visible": True, "locked": False, "opacity": 1}],
            "drawio_elements_v1": [row],
        })
        elements = out.get("drawio_elements_v1") or []
        self.assertEqual(len(elements), 1)
        return elements[0]

    def test_preserves_note_type(self):
        row = self._normalize_row({"id": "note_1", "type": "note"})
        self.assertEqual(row.get("type"), "note")

    def test_preserves_note_text_and_empty_text(self):
        row = self._normalize_row({"id": "note_1", "type": "note", "text": "Текст"})
        self.assertEqual(row.get("text"), "Текст")
        row_empty = self._normalize_row({"id": "note_2", "type": "note", "text": ""})
        self.assertEqual(row_empty.get("text"), "")

    def test_preserves_note_dimensions(self):
        row = self._normalize_row({"id": "note_1", "type": "note", "width": 240, "height": 180})
        self.assertEqual(row.get("width"), 240)
        self.assertEqual(row.get("height"), 180)

    def test_clamps_invalid_note_dimensions(self):
        row = self._normalize_row({"id": "note_1", "type": "note", "width": -500, "height": 99999})
        self.assertEqual(row.get("width"), 80)
        self.assertEqual(row.get("height"), 1600)

    def test_preserves_note_style(self):
        row = self._normalize_row({
            "id": "note_1",
            "type": "note",
            "style": {
                "bg_color": "#fde68a",
                "border_color": "#b45309",
                "text_color": "#111827",
            },
        })
        self.assertEqual(row.get("style"), {
            "bg_color": "#fde68a",
            "border_color": "#b45309",
            "text_color": "#111827",
        })

    def test_defaults_missing_note_style_narrowly(self):
        row = self._normalize_row({"id": "note_1", "type": "note", "style": {}})
        self.assertEqual(row.get("style"), {
            "bg_color": "#fef08a",
            "border_color": "#ca8a04",
            "text_color": "#1f2937",
        })

    def test_non_note_row_schema_unchanged(self):
        row = self._normalize_row({
            "id": "shape_1",
            "type": "rect",
            "text": "must_not_persist",
            "width": 300,
            "height": 200,
            "style": {"bg_color": "#000"},
        })
        self.assertNotIn("type", row)
        self.assertNotIn("text", row)
        self.assertNotIn("width", row)
        self.assertNotIn("height", row)
        self.assertNotIn("style", row)
        self.assertEqual(set(row.keys()), {
            "id",
            "layer_id",
            "visible",
            "locked",
            "deleted",
            "opacity",
            "offset_x",
            "offset_y",
            "z_index",
        })

    def test_invalid_note_type_is_ignored(self):
        row = self._normalize_row({"id": "row_1", "type": "sticker", "text": "abc", "width": 10, "height": 20})
        self.assertNotIn("type", row)
        self.assertNotIn("text", row)
        self.assertNotIn("width", row)
        self.assertNotIn("height", row)
        self.assertNotIn("style", row)

    def test_full_roundtrip_keeps_note_fields(self):
        source = {
            "enabled": True,
            "drawio_layers_v1": [{"id": "DL1", "name": "Default", "visible": True, "locked": False, "opacity": 1}],
            "drawio_elements_v1": [{
                "id": "note_1",
                "type": "note",
                "text": "",
                "width": 220,
                "height": 140,
                "style": {
                    "bg_color": "#fde68a",
                    "border_color": "#b45309",
                    "text_color": "#111827",
                },
            }],
        }
        first = self.normalize(source)
        second = self.normalize(first)
        row = (second.get("drawio_elements_v1") or [{}])[0]
        self.assertEqual(row.get("type"), "note")
        self.assertEqual(row.get("text"), "")
        self.assertEqual(row.get("width"), 220)
        self.assertEqual(row.get("height"), 140)
        self.assertEqual(row.get("style"), {
            "bg_color": "#fde68a",
            "border_color": "#b45309",
            "text_color": "#111827",
        })

