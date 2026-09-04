# Daur Calculator

Simple desktop calculator for jewellery pricing.

## Run

Open the project in PyCharm and run:

```python
app.py
```

## Formula Used

- `gold value = net wt * gold rate`
- `making charges = gold value * 18%`
- `diamond value = diamond wt * diamond rate`
- `subtotal = gold value + making charges + diamond value + 1200 rhodium charge + 1500 certificate charge`
- `gst = subtotal * 3%`
- `final total = subtotal + gst`

Gross weight is included as an input for reference.
