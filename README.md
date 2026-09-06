# Daur Calculator

Simple desktop calculator for jewellery pricing.

## Run

Run the local web server:

```python
python3 public_server.py
```

Then open http://127.0.0.1:8081 in a browser.

## Formula Used

- Enter the 24KT gold rate at sign-in. The calculator derives `14KT = 24KT × 0.60` and `18KT = 24KT × 0.76`.
- `gold value = net wt * 14KT gold rate`
- `making charges = gold value * 18%`
- `diamond value = diamond wt * diamond rate`
- `subtotal = gold value + making charges + diamond value + 1200 rhodium charge + 1500 certificate charge`
- `gst = subtotal * 3%`
- `final total = subtotal + gst`

Add an estimate under a person's name to collect product subtotals and a combined final total. The list can be downloaded as a PNG with the creation date and time.
