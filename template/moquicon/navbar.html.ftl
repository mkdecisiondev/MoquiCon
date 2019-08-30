<nav class="navbar navbar-expand-md navbar-dark bg-dark">
    <div class="d-flex flex-column moqui-navbar">
        <div class="container d-flex flex-row main-navbar">
            <a class="navbar-brand d-none d-sm-block"  href="/moquicon">
                <img height="60px" class="moqui-logo moqui-logo1" src="/moquicon/assets/moqui-logo.svg" alt="">
                <span class="font-italic navbar-title">MoquiCon</span>
            </a>
            <a class="navbar-brand d-block d-sm-none" href="/moquicon">
                <span class="font-italic navbar-title">MoquiCon</span>
            </a>
            <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#nav_collapse1" 
                aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>

            <div class="navbar-collapse collapse">
                <!-- Right aligned nav items -->
                <ul class="navbar-nav ml-auto">
                    <div class="text-secondary">
                        <span class="navbar-pop-title">MoquiCon 2019</span>
                    </div>
                </ul>
            </div>
        </div>
        <div id="nav_collapse1" class="container navbar-collapse collapse">
            <ul class="navbar-nav"><li class="nav-item dropdown">
                    <a class="nav-link" href="#" id="navbarDropdownMenuLink" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                        Tickets <i class="fas fa-angle-down icon-down"></i>
                    </a>
                    <div class="dropdown-menu" aria-labelledby="navbarDropdownMenuLink">
                        <a class="dropdown-item item-color" href="/moquicon/tickets/MOQUICON_PT_2019">
                            Physical Tickets
                        </a>
                        <a class="dropdown-item item-color" href="/moquicon/tickets/MOQUICON_VT_2019">
                            Virtual Tickets
                        </a>
                    </div>
                </li>
                <li class="nav-item">
                    <a class="nav-link" href="/moquicon/venue">
                        Venue
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" href="/moquicon/schedule">
                        Schedule
                    </a>
                </li>
<#--                <li class="nav-item">-->
<#--                    <a class="nav-link" href="/moquicon/sponsors">-->
<#--                        Sponsors-->
<#--                    </a>-->
<#--                </li>-->

<#--                <li class="nav-item">-->
<#--                    <a class="nav-link" href="/moquicon/contact">-->
<#--                        Contact-->
<#--                    </a>-->
<#--                </li>-->
            </ul>

            <!-- Right aligned nav items -->
            <ul class="navbar-nav ml-auto">
                <#if partyDetail??>
                    <li class="nav-item dropdown">
                        <a class="nav-link" href="#" id="navbarDropdownMenuLink" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                            <i class="fas fa-user"></i> 
                            ${partyDetail.firstName} ${partyDetail.lastName} ${partyDetail.organizationName!} <i class="fas fa-angle-down icon-down"></i>
                        </a>
                        <div class="dropdown-menu" aria-labelledby="navbarDropdownMenuLink">
                            <a class="dropdown-item item-color" href="/moquicon/d#/account">Account Settings</a>
                            <a class="dropdown-item item-color" href="/moquicon/d#/orders">My Orders</a>
                            <div role="separator" class="dropdown-divider"></div>
                            <form method="get" action="/moquicon/logOut">
                                <button type="submit" class="dropdown-item item-color">Signout</button>
                            </form>
                        </div>
                    </li>
<#--                <#else>-->
<#--                    <li class="nav-item">-->
<#--                        <a href="/moquicon/d#/account/create" class="nav-link">Join Now</a>-->
<#--                    </li>-->
<#--                    <li class="nav-item">-->
<#--                        <a href="/moquicon/d#/login" class="nav-link"><i class="fas fa-user"></i> Sign In</a>-->
<#--                    </li>-->
                </#if>

                 <#assign cartCount = 0>
                    <#if cartInfo.orderItemList??>
                        <#list cartInfo.orderItemList as item>
                            <#if item.itemTypeEnumId == "ItemProduct">
                                <#assign cartCount = cartCount + (item.quantity!1)>
                            </#if>
                        </#list>
                    </#if>
                <li class="nav-item">
                    <#if cartCount gt 0>
                        <a class="nav-link" href="/moquicon/d#/checkout">
                    <#else>
                        <a class="nav-link pointer" data-toggle="modal" data-target="#emptyCartModal">
                    </#if>
                        <span class="cart-quantity" id="cart-quantity">

                            ${cartCount}
                        </span>
                        <i class="fa fa-shopping-cart"></i>  
                        Cart
                    </a>
                </li>
                <li class="nav-item d-block d-sm-block d-md-none">
                    <div class="search-input">
                        <input type="text" placeholder="Search...">
                        <button class="search-button">
                            <i class="fa fa-search"></i>
                        </button>
                    </div>
                </li>
            </ul>
        </div>
    </div>
</nav>
<div class="modal fade" id="emptyCartModal" tabindex="-1" role="dialog" aria-labelledby="emptyCartModalLabel" aria-hidden="true">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title justify-content-center" id="emptyCartModalLabel">Your cart is empty.</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                <span aria-hidden="true">&times;</span>
                </button>
            </div>
        <div class="modal-body">
            Add a product to your cart (or a few!) before going to the check out.
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-info" data-dismiss="modal">Close</button>
        </div>
        </div>
    </div>
</div>
</div>
