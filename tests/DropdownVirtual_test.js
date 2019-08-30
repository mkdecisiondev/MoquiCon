Feature("Ticket Dropdown");

Scenario("Click Dropdown and Click Virtual Tickets", I => {
  I.amOnPage("/");
  I.see("MoquiCon");
  I.click("Tickets");
  I.click("Virtual Tickets");
  I.amOnPage("/tickets/MOQUICON_VT_2019");
});
