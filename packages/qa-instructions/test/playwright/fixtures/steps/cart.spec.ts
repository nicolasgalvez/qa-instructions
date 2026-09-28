import { test, expect } from '@playwright/test';

// Written like a real store's cart test: checks carry messages, name
// elements by variables, expect computed values, and the cart's state is
// read into variables before it is checked.

const QTY = 3;
const UNIT_PRICE = 5;

test('Add credits to the cart', async ({ page }) => {
  await page.goto('/shop');

  const productId = 1174;
  const form = page.locator(`#purchase_${productId}`);
  await expect(form, `purchase form for ${productId}`).toBeVisible();

  const qtyInput = form.locator('input[name="download_quantity"]');
  await qtyInput.fill(String(QTY));
  await expect(qtyInput).toHaveValue(String(QTY));
  await form.getByRole('button', { name: 'Purchase' }).click();
  await expect(page.getByText('Added to cart'), 'added message').toBeVisible();

  await page.goto('/cart');
  const subtotalAttr = await page
    .locator('#checkout_cart .cart-amount')
    .getAttribute('data-subtotal');
  const cartSubtotal = subtotalAttr !== null ? parseFloat(subtotalAttr) : null;
  const cartQty = parseInt(
    await page.locator('#checkout_cart input.item-quantity').inputValue(),
    10,
  );

  expect(cartQty, 'cart line-item quantity').toBe(QTY);
  expect(cartSubtotal, 'cart subtotal (qty × unit price)').toBeCloseTo(
    QTY * UNIT_PRICE,
    2,
  );
});
