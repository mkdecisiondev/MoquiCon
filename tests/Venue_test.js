Feature("Venue Page");

Scenario("Click Venue on NavBar", I => {
  I.amOnPage("/");
  I.see("MoquiCon");
  I.click("Venue");
  I.amOnPage("/venue");
  I.see("Welcome to beautiful San Diego");
  I.seeElement({ css: "iframe" });
  I.see("Find nearby hotels", { css: "button" });
});
