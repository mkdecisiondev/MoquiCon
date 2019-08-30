Feature("Home Ticket Button");

Scenario("Click Home Ticket Button", I => {
  I.amOnPage("/");
  I.see("MoquiCon");
  I.click("#home-button");
  I.amOnPage("/tickets/MOQUICON_PT_2019");
});
