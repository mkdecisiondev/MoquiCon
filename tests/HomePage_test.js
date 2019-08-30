Feature("HomePage");

Scenario("See homepage", I => {
  I.amOnPage("/");
  I.see("MoquiCon");
});
