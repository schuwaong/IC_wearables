# IC_wearables

Premium landing page for IC_wearables.

The primary landing-page CTA opens the on-page scan flow:

`https://schuwaong.github.io/IC_wearables/#face-lab`

The women's landing page uses the same on-page scan and then opens:

`https://schuwaong.github.io/IC_wearables/female/results.html`

## Face Colour Demo

Run the local backend demo:

```powershell
python -m pip install pillow
python demo_backend.py --port 5189
```

Then open:

`http://127.0.0.1:5189/`

The landing page posts uploaded face images to `/api/colour-profile`. If the
API is unavailable, the page falls back to the browser-side analyser.

Run the analyser directly:

```powershell
python colour_profile.py .\assets\mens-black-suit.jpg --pretty
```
