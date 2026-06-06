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

The analyser samples a skin-masked central face oval and returns an
`explanation` field showing the measured undertone, value, chroma, contrast,
runner-up season, and how many non-skin/background pixels were rejected. It is
still an estimate, so natural light and a clear front-facing photo matter.

Run the analyser directly:

```powershell
python colour_profile.py .\assets\mens-black-suit.jpg --pretty
```

## Capsule Outfit Generator

Build a static affiliate outfit rack from a CSV feed:

```powershell
python -m pip install requests beautifulsoup4 pandas
python capsule_outfit_generator.py --feed .\feed.csv --season "True Autumn" --affiliate-id YOUR_ID --network involve_asia --output .\outfits_rack.html
```

The script can also scrape a product/category URL with `--url`, then writes
downloaded product images into `images/` and renders shoppable outfit cards.
