# Life Sciences Agent Kit

Genesys-friendly Node.js 22 Cloud Functions for life sciences IV fluid catalog lookup, customer identity verification, and order confirmation.

## Functions

| Function | Genesys tool name (suggested) | Purpose |
|----------|-------------------------------|---------|
| `ls-get-life-science-products` | `ls_get_life_science_products` | Product catalog with stock; availability check per quantity (cases/bags) |
| `ls-idv-customer` | `ls_idv_customer` | Existing customer lookup by UID, account number, phone; returns last order |
| `ls-confirm-order` | `ls_confirm_order` | Confirms order, decrements stock, returns `orderConfirmationNumber` |
| `ls-subscribe-low-stock-alert` | `ls_subscribe_low_stock_alert` | Product details + subscribe/cancel low-stock alerts (account + phone only) |

## Demo customers

| Organization | uniqueIdentifier | accountNumber | Phone | Last order |
|--------------|------------------|---------------|-------|------------|
| Metro Regional Hospital | UID-LS-0042 | ACC-88421 | +61 400 111 222 | 8 cases Normal Saline |
| Coastal Day Surgery | UID-LS-0098 | ACC-55290 | +61 422 334 455 | 5 bags D5LR |
| Northside Infusion Clinic | UID-LS-0155 | ACC-77103 | +61 455 667 788 | 4 cases Lactated Ringer's |

## Example utterances

- "What IV fluids do you have?" → catalog (no args)
- "I need 10 cases of Normal Saline" → `productName: Normal Saline`, `quantity: 10`, `unit: case`
- "I need 5 bags of D5LR" → low-stock product; small qty OK
- "Repeat my last order" → IDV `lastOrder`, then confirm with same product/qty
- "Notify me when D5LR is back" → `ls_subscribe_low_stock_alert` with `accountNumber`, `phone`, `productName`, optional `quantity`/`unit`

### Subscribe low-stock alert (example)

```json
{
  "accountNumber": "78343",
  "phone": "0406910251",
  "productName": "D5LR",
  "quantity": 10,
  "unit": "case",
  "notifyWhenAvailable": true
}
```

Cancel: same fields with `"notifyWhenAvailable": false`.

## Build and test

```bash
cd Life-Sciences-Agent-Kit
npm run test:smoke
npm run zip
npm run verify:zip
```

## Dist output

- `dist/ls-get-life-science-products.zip`
- `dist/ls-idv-customer.zip`
- `dist/ls-confirm-order.zip`
- `dist/ls-subscribe-low-stock-alert.zip`
- `dist/Life-Sciences-Agent-Kit-All-Functions-Source.zip`
