"""Browser-only compatibility shim for ppocr_engine.

The Worker installs a list of JS-produced OCR records before invoking the
unchanged pyexam post-processing functions.  It deliberately has the same
RapidOCR call surface used by ppocr_engine; ONNX execution stays in JS where
onnxruntime-web can use the browser WASM runtime.
"""
import json

_records = []
def set_browser_records(records_json):
    global _records
    _records = json.loads(records_json)

class RapidOCR:
    def __init__(self, **kwargs): pass
    def __call__(self, img, use_det=True, use_cls=False, use_rec=True, **kwargs):
        # Records are injected page/column-by-page/column by the browser host.
        # Returning the next batch keeps pyexam's rapidocr-compatible path.
        rows = _records.pop(0) if _records else []
        if use_det and not use_rec: return ([r[0] for r in rows], None)
        if not use_det and use_rec:
            return (([[rows[0][1], rows[0][2]]] if rows else []), None)
        return (rows, None)
