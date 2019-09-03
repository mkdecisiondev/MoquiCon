Feature("Add to Cart");

Scenario("Add Physical Ticket to Cart", I => {
  I.amOnPage("/");
  I.see("MoquiCon");
  I.click("Tickets");
  I.click("Physical Tickets");
  I.amOnPage("/tickets/MOQUICON_PT_2019");
  I.see("Moquicon Physical Attendance Ticket 2019");
  I.click("//button[contains(., 'Add to Cart')]");
  I.waitForElement(
    locate("div")
      .find("a")
      .withText("Go to Checkout"),
    60
  );
  I.seeElement({ id: "cart-quantity" });
});
