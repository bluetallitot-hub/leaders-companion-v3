#!/usr/bin/env python3
"""Run Rivok Hebrew OCR on a Leader's Companion exported page PNG.
Install: pip install git+https://github.com/RivoksLab/paddleocr-hebrew huggingface_hub
Models: hf download Rivok/paddleocr-hebrew --include "charset_v2f.txt" "word-det/*" "server-svtrv2/*" --local-dir hebrew-ocr-models
Usage: python tools/rivok_ocr.py page.png --models hebrew-ocr-models --output rivok.json
No Docker, cloud service, or API key required.
"""
import argparse, json
from pathlib import Path
from paddleocr_hebrew import HebrewOCR
from paddleocr_hebrew.pipeline import render_page

def main():
 p=argparse.ArgumentParser()
 p.add_argument("image")
 p.add_argument("--models",default="hebrew-ocr-models")
 p.add_argument("--output",default="rivok.json")
 a=p.parse_args()
 ocr=HebrewOCR.word(a.models)
 result=ocr.read(a.image)
 img=render_page(a.image)
 h,w=img.shape[:2]
 result["imageWidth"]=w
 result["imageHeight"]=h
 result["engine"]="Rivok Hebrew PaddleOCR"
 Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
 print(f"Saved {len(result['words'])} word boxes and {len(result['lines'])} line boxes to {a.output}")
if __name__=="__main__": main()
