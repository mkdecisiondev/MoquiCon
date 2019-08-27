/* This software is in the public domain under CC0 1.0 Universal plus a Grant of Patent License. */
(function () {
  if ( typeof window.CustomEvent === "function" ) return false; //If not IE

  function CustomEvent ( event, params ) {
    params = params || { bubbles: false, cancelable: false, detail: undefined };
    var evt = document.createEvent( 'CustomEvent' );
    evt.initCustomEvent( event, params.bubbles, params.cancelable, params.detail );
    return evt;
   }

  CustomEvent.prototype = window.Event.prototype;

  window.CustomEvent = CustomEvent;
})();
var storeComps = {};

var moqui = {
    isString: function(obj) { return typeof obj === 'string'; },
    isBoolean: function(obj) { return typeof obj === 'boolean'; },
    isNumber: function(obj) { return typeof obj === 'number'; },
    isArray: function(obj) { return Object.prototype.toString.call(obj) === '[object Array]'; },
    isFunction: function(obj) { return Object.prototype.toString.call(obj) === '[object Function]'; },
    isPlainObject: function(obj) { return obj != null && typeof obj === 'object' && Object.prototype.toString.call(obj) === '[object Object]'; },

    NotFoundComponent: Vue.extend({ template: '<div><h4>Page not found!</h4></div>' }),
    EmptyComponent: Vue.extend({ template: '<div><div class="spinner"><div>Loading…</div></div></div>' }),

    LruMap: function(limit) {
        this.limit = limit; this.valueMap = {}; this.lruList = []; // end of list is least recently used
        this.put = function(key, value) {
            var lruList = this.lruList; var valueMap = this.valueMap;
            valueMap[key] = value; this._keyUsed(key);
            while (lruList.length > this.limit) { var rem = lruList.pop(); valueMap[rem] = null; }
        };
        this.get = function (key) {
            var value = this.valueMap[key];
            if (value) { this._keyUsed(key); }
            return value;
        };
        this.containsKey = function (key) { return !!this.valueMap[key]; };
        this._keyUsed = function(key) {
            var lruList = this.lruList;
            var lruIdx = -1;
            for (var i=0; i<lruList.length; i++) { if (lruList[i] === key) { lruIdx = i; break; }}
            if (lruIdx >= 0) { lruList.splice(lruIdx,1); }
            lruList.unshift(key);
        };
    }
};

/* ========== Notify and Error Handling ========== */

// TODO: adjust offset for final header height to stay just below the bottom of the header
moqui.notifyOpts = { delay:2000, offset:{x:20,y:120}, placement:{from:'top',align:'right'}, z_index:1100, type:'success',
    animate:{ enter:'animated fadeInDown', exit:'' } }; // no animate on exit: animated fadeOutUp
moqui.notifyOptsInfo = { delay:3000, offset:{x:20,y:120}, placement:{from:'top',align:'right'}, z_index:1100, type:'info',
    animate:{ enter:'animated fadeInDown', exit:'' } }; // no animate on exit: animated fadeOutUp
moqui.notifyOptsError = { delay:20000, offset:{x:20,y:120}, placement:{from:'top',align:'right'}, z_index:1100, type:'danger',
    animate:{ enter:'animated fadeInDown', exit:'' } }; // no animate on exit: animated fadeOutUp
moqui.notifyMessages = function(messages, errors, validationErrors) {
    var notified = false;
    if (messages) {
        if (moqui.isArray(messages)) {
            for (var mi=0; mi < messages.length; mi++) {
                var messageItem = messages[mi];
                if (moqui.isPlainObject(messageItem)) {
                    var msgType = messageItem.type; if (!msgType || !msgType.length) msgType = 'info';
                    $.notify({message:messageItem.message}, $.extend({}, moqui.notifyOptsInfo, { type:msgType }));
                } else {
                    $.notify({message:messageItem}, moqui.notifyOptsInfo);
                }
                notified = true;
            }
        } else {
            $.notify({message:messages}, moqui.notifyOptsInfo);
            notified = true;
        }
    }
    if (errors) {
        if (moqui.isArray(errors)) {
            for (var ei=0; ei < errors.length; ei++) {
                $.notify({message:errors[ei]}, moqui.notifyOptsError);
                notified = true;
            }
        } else {
            $.notify({message:errors}, moqui.notifyOptsError);
            notified = true;
        }
    }
    if (validationErrors) {
        if (moqui.isArray(validationErrors)) {
            for (var vei=0; vei < validationErrors.length; vei++) { moqui.notifyValidationError(validationErrors[vei]); notified = true; }
        } else {
            moqui.notifyValidationError(validationErrors); notified = true;
        }
    }
    return notified;
};
moqui.notifyValidationError = function(valError) {
    var message = valError;
    if (moqui.isPlainObject(valError)) {
        message = valError.message;
        if (valError.fieldPretty && valError.fieldPretty.length) message = message + " (for field " + valError.fieldPretty + ")";
    }
    $.notify({message:message}, moqui.notifyOptsError);
};
moqui.handleAjaxError = function(jqXHR, textStatus, errorThrown) {
    var resp = jqXHR.responseText;
    var respObj;
    try { respObj = JSON.parse(resp); } catch (e) { /* ignore error, don't always expect it to be JSON */ }
    console.warn('ajax ' + textStatus + ' (' + jqXHR.status + '), message ' + errorThrown /*+ '; response: ' + resp*/);
    // console.error('respObj: ' + JSON.stringify(respObj));

    if (jqXHR.status === 401 && window.storeApp) {
        window.storeApp.preLoginRoute = window.storeApp.$router.currentRoute;
        // handle login required but user not logged in, route to login
        window.storeApp.$router.push('/login');
    } else if (jqXHR.status === 0) {
        if (errorThrown.indexOf('abort') < 0) {
            var msg = 'Could not connect to server';
            $.notify({ message:msg }, moqui.notifyOptsError);
        }
    } else {
        var notified = false;
        if (respObj && moqui.isPlainObject(respObj)) { notified = moqui.notifyMessages(respObj.messageInfos, respObj.errors, respObj.validationErrors); }
        else if (resp && moqui.isString(resp) && resp.length) { notified = moqui.notifyMessages(resp); }
        if (!notified) {
            var errMsg = 'Error: ' + errorThrown + ' (' + textStatus + ')';
            $.notify({ message:errMsg }, moqui.notifyOptsError);
        }
    }
};

/* ========== Page Component Loading ========== */

moqui.componentCache = new moqui.LruMap(20);
moqui.handleLoadError = function (jqXHR, textStatus, errorThrown) {
    // NOTE: may want to do more or something different in the future, for now just do a notify
    moqui.handleAjaxError(jqXHR, textStatus, errorThrown);
};

Vue.component("route-placeholder", {
    props: { location: { type: String, required: true }, options: Object, properties: Object },
    data: function() { return { activeComponent: moqui.EmptyComponent }; },
    template: '<component :is="activeComponent" v-bind="properties"></component>',
    mounted: function() {
        var jsCompObj = this.options || {};
        // NOTE on cache: on initial load if there are multiple of the same component (like category-product) will load template multiple times, consider some sort of lock/wait
        var cachedComponent = moqui.componentCache.get(this.location);
        if (cachedComponent) {
            this.activeComponent = cachedComponent;
        } else {
            var vm = this;
            axios.get(this.location).then(function(res) {
                jsCompObj.template = res.data;
                var vueComp = Vue.extend(jsCompObj);
                vm.activeComponent = vueComp;
                moqui.componentCache.put(vm.location, vueComp);
            }, moqui.handleLoadError);
        }
    }
});
function getPlaceholderRoute(locationVar, name, props) {
    var component = {
        name:name,
        template: '<route-placeholder :location="$root.storeConfig.' + locationVar + '" :options="$root.storeComps.' + name + '" :properties="$props"></route-placeholder>'
    };
    if (props) { component.props = props; }
    return component;
}
var GeoService = {
    getCountries: function() { return axios.get("/rest/s1/pop/geos").then(function (response) { return response.data; }); },
    getRegions: function(geoId) { return axios.get("/rest/s1/pop/geos/" + geoId + "/regions").then(function (response) { return response.data; }); },
    getLocale: function() { return axios.get("/rest/s1/pop/locale").then(function (response) { return response.data; }); },
    getTimeZone: function() { return axios.get("/rest/s1/pop/timeZone").then(function (response) { return response.data; }); }
};

var LoginService = {
    login: function(user, headers) { return axios.post("/rest/s1/pop/login", user, headers).then(function (response) { return response.data; }); },
    loginFB: function(user, headers) { return axios.post("/rest/s1/pop/loginFB", user, headers).then(function (response) { return response.data; }); },
    createAccount: function(account, headers) { return axios.post("/rest/s1/pop/register", account, headers).then(function (response) { return response.data; }); },
    logout: function() { return axios.get("/rest/s1/pop/logout").then(function (response) { return response.data; }); },
    resetPassword: function(username, headers) { return axios.post("/rest/s1/pop/resetPassword", username, headers).then(function (response) { return response.data; }); }
};

var CustomerService = {
  getShippingAddresses: function(headers) {
    const t = new Date().getTime();
    return axios.get("/rest/s1/pop/customer/shippingAddresses?timeStamp=" + t,headers).then(function (response) { return response.data; });
  },
  addShippingAddress: function(address,headers) {
    return axios.put("/rest/s1/pop/customer/shippingAddresses",address,headers).then(function (response) { return response.data; });
  },
  getPaymentMethods: function(headers) {
    const t = new Date().getTime();
    return axios.get("/rest/s1/pop/customer/paymentMethods?timeStamp=" + t,headers).then(function (response) { return response.data; });
  },
  addPaymentMethod: function(paymentMethod,headers) {
    return axios.put("/rest/s1/pop/customer/paymentMethods",paymentMethod,headers).then(function (response) { return response.data; });
  },
  getCustomerOrders: function(headers) {
    return axios.get("/rest/s1/pop/customer/orders",headers).then(function (response) { return response.data; })
  },
  getCustomerOrderById: function(orderId,headers) {
    return axios.get("/rest/s1/pop/customer/orders/"+orderId,headers).then(function (response) { return response.data; });
  }, 
  getCustomerInfo: function(headers) {
    return axios.get("/rest/s1/pop/customer/info").then(function (response) { return response.data; });
  },
  updateCustomerInfo: function(customerInfo,headers) {
    return axios.put("/rest/s1/pop/customer/updateInfo",customerInfo,headers).then(function (response) { return response.data; });
  },
  updateCustomerPassword: function(customerInfo,headers) {
    return axios.put("/rest/s1/pop/customer/updatePassword",customerInfo, headers).then(function (response) { return response.data; });
  },
  deletePaymentMethod: function(paymentMethodId,headers) {
    return axios.delete("/rest/s1/pop/customer/paymentMethods/"+paymentMethodId, headers).then(function (response) { return response.data; });
  },
  deleteShippingAddress: function(contactMechId,contactMechPurposeId,headers) {
    return axios.delete("/rest/s1/pop/customer/shippingAddresses?contactMechId=" + contactMechId +"&contactMechPurposeId=" + contactMechPurposeId, headers)
        .then(function (response) { return response.data; });
  }
};

var ProductService = {
    getFeaturedProducts: function() {
        return axios.get("/rest/s1/pop/categories/PopcAllProducts/products").then(function (response) { return response.data.productList; });
    },
    getProductBySearch: function(searchTerm, pageIndex, pageSize, categoryId) {
        var params = "term=" + searchTerm + "&pageIndex=" + pageIndex + "&pageSize=" + pageSize;
        if (categoryId && categoryId.length) params += "&productCategoryId=" + categoryId;
        return axios.get("/rest/s1/pop/products/search?" + params).then(function (response) { return response.data; });
    },
    getProductsByCategory: function(categoryId, pageIndex, pageSize) {
        var params = "?pageIndex=" + pageIndex + "&pageSize=" + pageSize;
        return axios.get("/rest/s1/pop/categories/" + categoryId + "/products" + params).then(function (response) { return response.data; });
    },
    getCategoryInfoById: function(categoryId) {
        return axios.get("/rest/s1/pop/categories/" + categoryId + "/info").then(function (response) { return response.data; });
    },
    getSubCategories: function(categoryId) {
        return axios.get("/rest/s1/pop/categories/" + categoryId + "/info").then(function (response) { return response.data.subCategoryList; });
    },
    getProduct: function(productId) {
        return axios.get("/rest/s1/pop/products/" + productId).then(function (response) { return response.data; });
    },
    getProductContent: function(productId, contentTypeEnumId) {
        return axios.get("/rest/s1/pop/products/content?productId=" + productId + "&productContentTypeEnumId=" + contentTypeEnumId)
            .then(function (response) { return response.data; });
    },
    addProductCart: function(product,headers) {
        return axios.post("/rest/s1/pop/cart/add",product,headers).then(function (response) { return response.data; });
    },
    getCartInfo: function(headers) {
        const t = new Date().getTime();
        return axios.get("/rest/s1/pop/cart/info?timeStamp=" + t,headers).then(function (response) { return response.data; });
    },
    addCartBillingShipping: function(data, headers) {
        return axios.post("/rest/s1/pop/cart/billingShipping",data,headers).then(function (response) { return response.data; });
    },
    getCartShippingOptions: function(headers) {
        return axios.get("/rest/s1/pop/cart/shippingOptions", headers).then(function (response) { return response.data; });
    },
    placeCartOrder: function(data, headers) {
        return axios.post("/rest/s1/pop/cart/place",data,headers).then(function (response) { return response.data; });
    },
    updateProductQuantity: function(data, headers) {
        return axios.post("/rest/s1/pop/cart/updateProductQuantity",data,headers).then(function (response) { return response.data; });
    },
    deleteOrderProduct: function(orderId, orderItemSeqId,headers) {
        return axios.delete("/rest/s1/pop/cart/deleteOrderItem?orderId="+orderId+"&orderItemSeqId="+orderItemSeqId,headers)
            .then(function (response) { return response.data; });
    },
    addPromoCode: function(data, headers) {
        return axios.post("/rest/s1/pop/cart/promoCode",data,headers).then(function (response) { return response.data; });
    },
    deletePromoCode: function(data, headers) {
        return axios.delete("/rest/s1/pop/cart/promoCode",data,headers).then(function (response) { return response.data; });
    }
};
/* This software is in the public domain under CC0 1.0 Universal plus a Grant of Patent License. */
storeComps.Navbar = {
  name: "navbar",
  data: function() { return {
      homePath: "", customerInfo: {}, categories: [], searchText: "", productsQuantity: 0, storeInfo: [],
      axiosConfig: { headers: { "Content-Type": "application/json;charset=UTF-8", "Access-Control-Allow-Origin": "*",
              "api_key":this.$root.apiKey, "moquiSessionToken":this.$root.moquiSessionToken } }
  }; },
  props: ["subBar"],
  methods: {
    getCustomerInfo: function() { CustomerService.getCustomerInfo(this.axiosConfig).then(function (data) {
        this.customerInfo = data;
    }.bind(this)).catch(function (error)  { console.log('An error has occurred' + error); }); },
    getCartInfo: function() { ProductService.getCartInfo(this.axiosConfig).then(function (data) {
        //this.productsQuantity = data.orderItemList ? data.orderItemList.length : 0;
        if(typeof(data.orderItemList) == 'undefined') return;
        for(var i = 0; i < data.orderItemList.length; i++) {
            if(data.orderItemList[i].itemTypeEnumId == 'ItemProduct') {
                this.productsQuantity = data.orderItemList[i].quantity + this.productsQuantity;
            }
        }
    }.bind(this)); },
    logout: function() { LoginService.logout().then(function (data) {
        this.$root.apiKey = null;
        this.$router.push({ name: "login"});
      }.bind(this)); 
    },
    searchProduct: function() { location.href ="/store/search/"+this.searchText; }
  },
  created: function() {
    this.storeInfo = this.$root.storeInfo;
  },
  mounted: function() {
      var vm = this;
      if (this.storeInfo.categoryByType && this.storeInfo.categoryByType.PsctBrowseRoot && this.storeInfo.categoryByType.PsctBrowseRoot.productCategoryId) {
        ProductService.getSubCategories(this.storeInfo.categoryByType.PsctBrowseRoot.productCategoryId).then(function(categories) { vm.categories = categories; }); }
      if (this.$root.apiKey != null) { 
          if(this.$root.customerInfo != null){
              this.customerInfo = this.$root.customerInfo;
          } else {
              this.getCustomerInfo();
          } 
      }
      this.getCartInfo();
      this.homePath = storeConfig.homePath;
  }
};
storeComps.NavbarTemplate = getPlaceholderRoute("template_client_header", "Navbar", storeComps.Navbar.props);
Vue.component("navbar", storeComps.NavbarTemplate);

storeComps.FooterPage = {
    name: "footer-page",
    data: function() { return {}; },
    props: ["infoLink"]
};
storeComps.FooterPageTemplate = getPlaceholderRoute("template_client_footer", "FooterPage", storeComps.FooterPage.props);
Vue.component("footer-page", storeComps.FooterPageTemplate);

storeComps.MenuLeft = {
    name: "menu-left",
    data: function() { return {}; },
    props: ["type"]
};
storeComps.MenuLeftTemplate = getPlaceholderRoute("template_client_menu", "MenuLeft", storeComps.MenuLeft.props);
Vue.component("menu-left", storeComps.MenuLeftTemplate);


storeComps.ModalAddress = {
    name: "modal-address",
    data: function() { return { 
      axiosConfig: { headers: { "Content-Type": "application/json;charset=UTF-8", "Access-Control-Allow-Origin": "*",
              "api_key":this.$root.apiKey, "moquiSessionToken":this.$root.moquiSessionToken }},
      toNameErrorMessage: "", 
      countryErrorMessage: "",
      addressErrorMessage: "",
      cityErrorMessage: "",
      postalCodeErrorMessage: "",
      stateErrorMessage: "",
      contactNumberErrorMessage: "",
      regionsList: [],
      disabled: false
    }; },
    props: ["shippingAddress", "isUpdate", "cancelCallback", "completeCallback"],
    computed: {
      isDisabled: function(){
        return this.disabled;
      }
    },
    methods: {
        getRegions: function(geoId) { 
            GeoService.getRegions(geoId).then(function (data){ this.regionsList = data.resultList; }.bind(this));
        },
        resetToNameErrorMessage: function(formField) {
            if (this.formField != "") {
                this.toNameErrorMessage = "";
            } 
        }, 
        resetCountryErrorMessage: function(formField) {
            if (this.formField != "") {
            this.countryErrorMessage = "";
            } 
        }, 
        resetAddressErrorMessage: function(formField) {
            if (this.formField != "") {
            this.addressErrorMessage = "";
            } 
        }, 
        resetCityErrorMessage: function(formField) {
            if (this.formField != "") {
            this.cityErrorMessage = "";
            } 
        }, 
        resetStateErrorMessage: function(formField) {
            if (this.formField != "") {
            this.stateErrorMessage = "";
            } 
        }, 
        resetPostalCodeErrorMessage: function(formField) {
            if (this.formField != "") {
            this.postalCodeErrorMessage = "";
            } 
        }, 
        resetContactNumberErrorMessage: function(formField) {
            if (this.formField != "") {
            this.contactNumberErrorMessage = "";
            } 
        },
        addCustomerShippingAddress: function() {
            var error = false;
            if (this.shippingAddress.toName == null || this.shippingAddress.toName.trim() === "") {
                this.toNameErrorMessage = "Please enter a recipient name";
                error = true;
            }
            if (this.shippingAddress.countryGeoId == null || this.shippingAddress.countryGeoId.trim() === "") {
                this.countryErrorMessage = "Please select a country";
                error = true;
            } 
            if (this.shippingAddress.address1 == null || this.shippingAddress.address1.trim() === "") {
                this.addressErrorMessage = "Please enter a street address";
                error = true;
            } 
            if (this.shippingAddress.city == null || this.shippingAddress.city.trim() === "") {
                this.cityErrorMessage = "Please enter a city";
                error = true;
            } 
            if (this.shippingAddress.stateProvinceGeoId == null || this.shippingAddress.stateProvinceGeoId.trim() === "") {
                this.stateErrorMessage = "Please enter a state";
                error = true;
            } 
            if (this.shippingAddress.postalCode == null || this.shippingAddress.postalCode.trim() === "") {
                this.postalCodeErrorMessage = "Please enter a postcode";
                error = true;
            } 
            if (this.shippingAddress.contactNumber == null || this.shippingAddress.contactNumber.trim() === "") {
                this.contactNumberErrorMessage = "Please enter a phone number";
                error = true;
            }else{
                var isNum = /^\d+$/.test(this.shippingAddress.contactNumber);

                if(!isNum){
                    this.contactNumberErrorMessage = "Please enter a valid phone number(only numbers)";
                    error = true;
                }
            }
            if(error){
                return;
            }

            this.disabled = true;
            CustomerService.addShippingAddress(this.shippingAddress, this.axiosConfig).then(function (data) {
                this.responseMessage = "";
                this.completeCallback(data);
            }.bind(this));
        },
        reset: function(){
            this.disabled = false;
            this.resetToNameErrorMessage();
            this.resetCountryErrorMessage();
            this.resetAddressErrorMessage();
            this.resetCityErrorMessage();
            this.resetStateErrorMessage();
            this.resetPostalCodeErrorMessage();
            this.resetContactNumberErrorMessage();
        }
    },
    mounted: function() {
      var vm = this;
      this.disabled = false;
      this.shippingAddress.countryGeoId = 'USA';
      this.getRegions(this.shippingAddress.countryGeoId);
      $('#addressModal').on('show.bs.modal', function(e) { vm.reset() });
      $('#addressFormModal').on('show.bs.modal', function(e) { vm.reset() });
    }
};
storeComps.ModalAddressTemplate = getPlaceholderRoute("template_client_modalAddress", "ModalAddress", storeComps.ModalAddress.props);
Vue.component("modal-address", storeComps.ModalAddressTemplate);



storeComps.ModalCreditCard = {
    name: "modal-credit-card",
    data: function() { return { 
      axiosConfig: { headers: { "Content-Type": "application/json;charset=UTF-8", "Access-Control-Allow-Origin": "*",
              "api_key":this.$root.apiKey, "moquiSessionToken":this.$root.moquiSessionToken }},
      responseMessage: "", 
      paymentAddressOption: "",
      countryErrorMessage: "",
      addressErrorMessage: "",
      cityErrorMessage: "",
      postalCodeErrorMessage: "",
      stateErrorMessage: "",
      contactNumberErrorMessage: "",
      regionsList: [],
      disabled: true
    }; },
    props: ["paymentMethod", "isUpdate", "addressList", "cancelCallback", "completeCallback"],
    computed: {
      isDisabled: function(){
        return this.disabled;
      }
    },
    methods: {
        getRegions: function(geoId) { 
            GeoService.getRegions(geoId).then(function (data){ this.regionsList = data.resultList; }.bind(this));
        },
        selectBillingAddress: function(address) {
            if (address == 'NEW_ADDRESS') {
                this.paymentMethod.address1 = "";
                this.paymentMethod.address2 = "";
                this.paymentMethod.toName = "";
                this.paymentMethod.attnName = "";
                this.paymentMethod.city = "";
                this.paymentMethod.countryGeoId = "";
                this.paymentMethod.contactNumber = "";
                this.paymentMethod.postalCode = "";
                this.paymentMethod.stateProvinceGeoId = "";
            } else if (typeof address.postalAddress === 'object' && address.postalAddress !== null) {
                this.paymentMethod.address1 = address.postalAddress.address1;
                this.paymentMethod.address2 = address.postalAddress.address2;
                this.paymentMethod.toName = address.postalAddress.toName;
                this.paymentMethod.attnName = address.postalAddress.attnName;
                this.paymentMethod.city = address.postalAddress.city;
                this.paymentMethod.countryGeoId = address.postalAddress.countryGeoId;
                this.paymentMethod.contactNumber = address.telecomNumber.contactNumber;
                this.paymentMethod.postalCode = address.postalAddress.postalCode;
                this.paymentMethod.stateProvinceGeoId = address.postalAddress.stateProvinceGeoId;
                this.responseMessage = "";
            }
            this.getRegions(STORE_COUNTRY);
        },
        addCustomerPaymentMethod: function(event) {
            event.preventDefault();
            this.paymentMethod.paymentMethodTypeEnumId = "PmtCreditCard";
            this.paymentMethod.countryGeoId = STORE_COUNTRY;

            if (this.paymentMethod.titleOnAccount == null || this.paymentMethod.titleOnAccount.trim() === "") {
                this.responseMessage = "Please privide the name on the card";
                return;
            }
            if (this.paymentMethod.cardNumber == null || this.paymentMethod.cardNumber.trim() === "") {
                this.responseMessage = "Please privide the card number";
                return;
            }
            if (this.paymentMethod.expireMonth == null || this.paymentMethod.expireMonth.trim() === ""
                || this.paymentMethod.expireYear == null || this.paymentMethod.expireYear === "") {
                this.responseMessage = "Please privide the card expiry month and year";
                return;
            }
            if (this.paymentMethod.address1 == null || this.paymentMethod.address1.trim() === "" ||
                this.paymentMethod.city == null || this.paymentMethod.city.trim() === "") {
                this.responseMessage = "Please provide a billing address";
                return;
            }
            if (this.paymentMethod.cardNumber.startsWith("5")) {
                this.paymentMethod.creditCardTypeEnumId = "CctMastercard";
            } else if (this.paymentMethod.cardNumber.startsWith("4")){
                this.paymentMethod.creditCardTypeEnumId = "CctVisa";
            }
           
            if (this.paymentMethod.postalContactMechId == null) {
                this.paymentMethod.postalContactMechId = this.paymentAddressOption.postalContactMechId;
                this.paymentMethod.telecomContactMechId = this.paymentAddressOption.telecomContactMechId;
            }
            if (this.isUpdate) { this.paymentMethod.cardNumber = ""; }

            this.disabled = true;
            CustomerService.addPaymentMethod(this.paymentMethod,this.axiosConfig).then(function (data) {
                this.responseMessage = "";
                this.completeCallback(data);
            }.bind(this)).catch(function (error) {
                var errorString = error.response.data.errors;
                var sensitiveDataIndex = errorString.indexOf("(for field");

                if (sensitiveDataIndex > -1) {
                    this.responseMessage = errorString.slice(0, sensitiveDataIndex);
                }

                this.disabled = false;
            }.bind(this));
        },
        reset: function(){
          $("#modal-card-content").trigger('reset');
          this.disabled = false;
          this.responseMessage = null;
          this.paymentAddressOption = "";
        }
    },
    mounted: function() {
      var vm = this;
      this.disabled = false;
      $('#creditCardModal').on('show.bs.modal', function(e){ vm.reset() });
    }
};
storeComps.ModalCreditCardTemplate = getPlaceholderRoute("template_client_modalCreditCard", "ModalCreditCard", storeComps.ModalCreditCard.props);
Vue.component("modal-credit-card", storeComps.ModalCreditCardTemplate);
storeComps.ProductImage = {
    name: "product-image",
    data: function() { return { content: {} } },
    methods: {
        getProductContent: function(){
            ProductService.getProductContent(this._props.productId, "PcntImageSmall").then(function (data) { 
                if(typeof(data.productContent) == 'undefined') {
                    ProductService.getProductContent(this._props.productId, "PcntImageMedium").then(function (data) { 
                        if(typeof(data.productContent) == 'undefined') {
                            ProductService.getProductContent(this._props.productId, "PcntImageLarge").then(function (data) {
                                this.content = data.productContent;
                            }.bind(this));
                        } else{ this.content = data.productContent; }
                    }.bind(this));
                } else { this.content = data.productContent; }
            }.bind(this));
        },
        getProductImage: function() {
            if(this.content == null || typeof(this.content.productContentId) == 'undefined') return null;
            return storeConfig.productImageLocation + this.content.productContentId;
        }
    },
    props: ["productId"],
    mounted: function() {
        this.getProductContent();
    }
};
storeComps.ProductImageTemplate = getPlaceholderRoute("template_client_productImage", "ProductImage", storeComps.ProductImage.props);

/* This software is in the public domain under CC0 1.0 Universal plus a Grant of Patent License. */
var STORE_COUNTRY = "USA";

storeComps.LoginPage = {
    name: "login",
    data: function() { return {
        homePath: "", user: {username: "", password: ""}, loginErrormessage: "", responseMessage : "", 
        passwordInfo: { username: "", oldPassword: "", newPassword: "", newPasswordVerify: "" },
        axiosConfig: { headers: { "Content-Type": "application/json;charset=UTF-8", "Access-Control-Allow-Origin": "*",
                "moquiSessionToken": this.$root.moquiSessionToken } }
    }; },
    computed: {
        apiKey: function() { return this.$root.apiKey }
    },
    methods: {
        login: function() {
            if (this.user.username.length < 3 || this.user.password.length < 3) {
                this.loginErrormessage = "You must type a valid Username and Password";
                return;
            }
            LoginService.login(this.user, this.axiosConfig).then(function (data) {
                if(data.forcePasswordChange == true) { 
                    this.showModal('modal'); 
                } else { 
                    this.$root.apiKey = data.apiKey; 
                    this.$root.moquiSessionToken = data.moquiSessionToken; 
                    if(preLoginRoute.name == null || preLoginRoute.name == "createaccount") {
                        this.$router.push({ name: "account"});
                    } else {
                        this.$router.push({ name: preLoginRoute.name});
                    }
                }
            }.bind(this))
            .catch(function (error) { 
                if(!!error.response && !!error.response.headers){
                    this.axiosConfig.headers.moquiSessionToken = error.response.headers.moquisessiontoken;
                    this.$root.moquiSessionToken = error.response.headers.moquisessiontoken;
                }                
                this.loginErrormessage = error.response.data.errors; 
            }.bind(this));
        },
        checkLoginState: function() {
            FB.login(function(response) {
                if(response && response.status == 'connected') {
                    $.ajax({
                        type: "GET",
                        url: 'https://graph.facebook.com/v3.3/me?fields=id,first_name,last_name,email',
                        data: { 'access_token':response.authResponse.accessToken },
                        success: function (result) {
                            var userData = {
                                firstName: result.first_name,
                                lastName: result.last_name,
                                email: result.email
                            };
                            LoginService.loginFB(userData, this.axiosConfig).then(function (data) {
                                this.$root.moquiSessionToken = data.moquiSessionToken;

                                if (!data.apiKey) {
                                    window.location.reload();
                                } else {
                                    this.$root.apiKey = data.apiKey;
                                    this.$router.push({ name: "account" });
                                }
                            }.bind(this));
                        }.bind(this),
                        error: function (error) { console.error(error) } 
                    });
                } else {
                    console.error(response);
                }
            }.bind(this), {scope: 'public_profile,email'});
        },
        changePassword: function(event) {
            event.preventDefault();

            var hasNumber = '(?=.*[0-9])';
            // var hasLowercaseChar = '(?=.*[a-z])';
            // var hasUppercaseChar = '(?=.*[A-Z])';
            var hasSpecialChar = '(?=.*[\\W_])';
            var expreg = new RegExp('^' + hasNumber /* + hasLowercaseChar + hasUppercaseChar */ + hasSpecialChar + '.{8,35}$');

            if (this.passwordInfo.username == null || this.passwordInfo.username.trim() == "") {
                this.responseMessage = "You must enter a valid username";
                return;
            }

            if (!expreg.test(this.passwordInfo.newPassword)) {
                this.responseMessage = "The password must have at least 8 characters, including a special character and a number.";
                return;
            }

            if (this.passwordInfo.newPassword !== this.passwordInfo.newPasswordVerify) {
                this.responseMessage = "Passwords do not match";
                return;
            }
            CustomerService.updateCustomerPassword(this.passwordInfo, this.axiosConfig).then(function (data) {
                this.user.username = this.passwordInfo.username;
                this.user.password = this.passwordInfo.newPassword;               
                this.login();
            }.bind(this))
            .catch(function (error) {
                this.responseMessage = error.response.data.errors;
            }.bind(this));
        },
        showModal: function(modalId) { $('#'+modalId).modal('show'); },
    },
    mounted: function() { if (this.$root.apiKey != null) { this.$router.push({ name: "account"}) }},
};
storeComps.LoginPageTemplate = getPlaceholderRoute("template_client_login", "LoginPage");

storeComps.ResetPasswordPage = {
    name: "reset-password",
    data: function() { return {
        homePath: "", data: { username: "" },
        passwordInfo: { username: "", oldPassword: "", newPassword: "", newPasswordVerify: "" },
        nextStep: 0, responseMessage: "",
        axiosConfig: { headers: { "Content-Type": "application/json;charset=UTF-8", "Access-Control-Allow-Origin": "*",
                "moquiSessionToken":this.$root.moquiSessionToken } }
    }; },
    methods: {
        resetPassword: function(event) {
            event.preventDefault();
            LoginService.resetPassword(this.data, this.axiosConfig).then(function (data) {
                this.nextStep = 1;
                this.responseMessage = "";
            }.bind(this)).catch(function (error) { this.responseMessage = error.response.data.errors; }.bind(this));
        },
        changePassword: function(event) {
            event.preventDefault();
            
            var hasNumber = '(?=.*[0-9])';
            // var hasLowercaseChar = '(?=.*[a-z])';
            // var hasUppercaseChar = '(?=.*[A-Z])';
            var hasSpecialChar = '(?=.*[\\W_])';
            var expreg = new RegExp('^' + hasNumber /* + hasLowercaseChar + hasUppercaseChar */ + hasSpecialChar + '.{8,35}$');

            if (!expreg.test(this.passwordInfo.newPassword)) {
                this.responseMessage = "The password must have at least 8 characters, including a special character and a number.";
                return;
            }

            if (this.passwordInfo.newPassword !== this.passwordInfo.newPasswordVerify) {
                this.responseMessage = "Passwords do not match";
                return;
            }
            this.passwordInfo.username = this.data.username;
            CustomerService.updateCustomerPassword(this.passwordInfo, this.axiosConfig).then(function (data) {
                this.responseMessage = data.messages;
                this.login();
            }.bind(this))
            .catch(function (error) {
                this.responseMessage = error.response.data.errors;
            }.bind(this));
        },
        login: function() {
            var user = { username: this.passwordInfo.username, password: this.passwordInfo.newPassword };
            LoginService.login(user, this.axiosConfig).then(function (data) {
                this.$root.apiKey = data.apiKey;
                this.$root.moquiSessionToken = data.moquiSessionToken;
                this.$router.push({ name: 'account'});
            }.bind(this)).catch(function (error) {
                if(!!error.response && !!error.response.headers){
                    this.axiosConfig.headers.moquiSessionToken = error.response.headers.moquisessiontoken;
                    this.$root.moquiSessionToken = error.response.headers.moquisessiontoken;
                }
            }.bind(this));
        }
    },
    mounted: function(){
        this.$nextTick(() => {
            this.nextStep = this.$route.query.step ? this.$route.query.step : 0;
            if(this.nextStep == 2){
                this.data.username = this.$route.query.username ? this.$route.query.username : "";
            }
		});
    }
};
storeComps.ResetPasswordTemplate = getPlaceholderRoute("template_client_resetPassword", "ResetPasswordPage");

storeComps.AccountPage = {
    name: "account-page",
    data: function() { return {
        homePath: "", customerInfo: {}, passwordInfo: {}, shippingAddressList: [],
        countriesList: [], regionsList: [], localeList: [], timeZoneList: [],
        shippingAddress: {}, addressOption: "", customerPaymentMethods: [],
        paymentAddressOption: {}, paymentOption: "", paymentMethod: {},
        responseMessage: "", 
        toNameErrorMessage: "", countryErrorMessage: "", addressErrorMessage: "", 
        cityErrorMessage: "", stateErrorMessage: "", postalCodeErrorMessage: "", contactNumberErrorMessage: "",
        isUpdate: false, message: { state: "", message: "" },
        axiosConfig: { headers: { "Content-Type": "application/json;charset=UTF-8", "Access-Control-Allow-Origin": "*",
                "api_key":this.$root.apiKey, "moquiSessionToken":this.$root.moquiSessionToken } }
    }; },
    methods: {
        getCustomerInfo: function() { CustomerService.getCustomerInfo(this.axiosConfig)
            .then(function (data) { this.setCustomerInfo(data); }.bind(this)); },
        getCustomerAddresses: function() { CustomerService.getShippingAddresses(this.axiosConfig)
            .then(function (data) { this.shippingAddressList = data.postalAddressList; }.bind(this)); },
        getCustomerPaymentMethods: function() { CustomerService.getPaymentMethods(this.axiosConfig)
            .then(function (data) { this.customerPaymentMethods = data.methodInfoList; }.bind(this)); },

        resetData: function() {
            this.paymentMethod = {};
            this.shippingAddress = {};
            this.paymentAddressOption = {};
            this.isUpdate = false;
            this.shippingAddress.countryGeoId = 'USA';
        },
        updateCustomerInfo: function() {
            if (this.customerInfo.username == null || this.customerInfo.username.trim() === "") {
                this.message.state = 2;
                this.message.message = "Please provide username";
                return;
            }
            if (this.customerInfo.firstName == null || this.customerInfo.firstName.trim() === ""
            || this.customerInfo.lastName == null || this.customerInfo.lastName.trim() === "") {
                this.message.state = 2;
                this.message.message = "Please provide first and last name";
                return;
            }
            if (this.customerInfo.emailAddress == null || this.customerInfo.emailAddress.trim() === "") {
                this.message.state = 2;
                this.message.message = "Please provide a valid email address";
                return;
            }
            CustomerService.updateCustomerInfo(this.customerInfo,this.axiosConfig).then(function (data) {
                this.setCustomerInfo(data.customerInfo);
                this.message.state = 1;
                this.message.message = "Correct! Your data has been updated.";
            }.bind(this));
        },
        setCustomerInfo: function(data) {
            this.customerInfo.username = data.username;
            this.customerInfo.partyId = data.partyId;
            this.customerInfo.firstName = data.firstName;
            this.customerInfo.lastName = data.lastName;
            this.customerInfo.emailAddress = data.emailAddress;
            this.customerInfo.contactMechId = data.telecomNumber ? data.telecomNumber.contactMechId : "";
            this.customerInfo.contactNumber = data.telecomNumber ? data.telecomNumber.contactNumber : "";
        },
        updateCustomerPassword: function(event) {
            event.preventDefault();

            var hasNumber = '(?=.*[0-9])';
            // var hasLowercaseChar = '(?=.*[a-z])';
            // var hasUppercaseChar = '(?=.*[A-Z])';
            var hasSpecialChar = '(?=.*[\\W_])';
            var expreg = new RegExp('^' + hasNumber /* + hasLowercaseChar + hasUppercaseChar */ + hasSpecialChar + '.{8,35}$');

            if (!expreg.test(this.passwordInfo.newPassword)) {
                this.responseMessage = "The password must have at least 8 characters, including a special character and a number.";
                return;
            }

            if (this.passwordInfo.newPassword !== this.passwordInfo.newPasswordVerify) {
                this.responseMessage = "Passwords do not match";
                return;
            }

            this.passwordInfo.userId = this.customerInfo.userId;

            CustomerService.updateCustomerPassword(this.passwordInfo,this.axiosConfig).then(function (data) {
                this.responseMessage = data.messages.replace("null",this.customerInfo.username);
                this.passwordInfo = {};
            }.bind(this)).catch(function (error) {
                    this.responseMessage = "An error occurred: " + error.response.data.errors;
            }.bind(this));
        },
        scrollTo: function(refName) {
            if (refName == null) {
                window.scrollTo(0, 0);
            } else {
                var element = this.$refs[refName];
                var top = element.offsetTop;
                window.scrollTo(0, top);
            }
        },
        deletePaymentMethod: function(paymentMethodId) {
            CustomerService.deletePaymentMethod(paymentMethodId,this.axiosConfig).then(function (data) {
                this.getCustomerPaymentMethods();
                this.hideModal("modal5");
            }.bind(this));
        },
        deleteShippingAddress: function(contactMechId,contactMechPurposeId) {
            CustomerService.deleteShippingAddress(contactMechId,contactMechPurposeId, this.axiosConfig).then(function (data) {
                this.getCustomerAddresses();
                this.hideModal("modal4");
            }.bind(this));
        },
        getCountries: function() { GeoService.getCountries().then(function (data) { this.countriesList = data.geoList; }.bind(this)); },
        getRegions: function(geoId) { GeoService.getRegions(geoId).then(function (data){ this.regionsList = data.resultList; }.bind(this)); },
        getLocale: function() { GeoService.getLocale().then(function (data) { this.localeList = data.localeStringList; }.bind(this)); },
        getTimeZone: function() { GeoService.getTimeZone().then(function (data) { this.timeZoneList = data.timeZoneList; }.bind(this)); },
        selectAddress: function(address) {
            this.shippingAddress = {};
            this.shippingAddress.address1 = address.postalAddress.address1;
            this.shippingAddress.address2 = address.postalAddress.address2;
            this.shippingAddress.toName = address.postalAddress.toName;
            this.shippingAddress.city = address.postalAddress.city;
            this.shippingAddress.countryGeoId = address.postalAddress.countryGeoId;
            this.shippingAddress.contactNumber = address.telecomNumber.contactNumber;
            this.shippingAddress.postalCode = address.postalAddress.postalCode;
            this.shippingAddress.stateProvinceGeoId = address.postalAddress.stateProvinceGeoId;
            this.shippingAddress.postalContactMechId = address.postalContactMechId;
            this.shippingAddress.telecomContactMechId = address.telecomContactMechId;
            this.shippingAddress.postalContactMechPurposeId = address.postalContactMechPurposeId;
            this.shippingAddress.attnName = address.postalAddress.attnName;
            this.responseMessage = "";
        },
        
        selectPaymentMethod: function(method) {
            this.paymentMethod = {};
            this.paymentMethod.paymentMethodId = method.paymentMethodId;
            this.paymentMethod.paymentMethodTypeEnumId = method.paymentMethod.PmtCreditCard;
            this.paymentMethod.cardNumber = method.creditCard.cardNumber;
            this.paymentMethod.titleOnAccount = method.paymentMethod.titleOnAccount;
            this.paymentMethod.expireMonth = method.expireMonth;
            this.paymentMethod.expireYear = method.expireYear;
            this.paymentMethod.postalContactMechId = method.paymentMethod.postalContactMechId;
            this.paymentMethod.telecomContactMechId = method.paymentMethod.telecomContactMechId;

            this.paymentMethod.address1 = method.postalAddress.address1;
            this.paymentMethod.address2 = method.postalAddress.address2;
            this.paymentMethod.toName = method.postalAddress.toName;
            this.paymentMethod.city = method.postalAddress.city;
            this.paymentMethod.countryGeoId = method.postalAddress.countryGeoId;
            this.paymentMethod.contactNumber = method.telecomNumber.contactNumber;
            this.paymentMethod.postalCode = method.postalAddress.postalCode;
            this.paymentMethod.stateProvinceGeoId = method.postalAddress.stateProvinceGeoId;

            this.getRegions(STORE_COUNTRY);

            this.paymentMethod.cardSecurityCode = "";
            this.responseMessage = "";
        },
        hideModal: function(modalid) { $('#'+modalid).modal('hide'); },

        onAddressCancel: function() {
            this.hideModal("addressModal");
        },

        onAddressUpserted: function(address) {
            this.getCustomerAddresses();
            this.hideModal("addressModal");
        },

        onCreditCardCancel: function() {
            this.hideModal("creditCardModal");
        },

        onCreditCardSet: function() {
            this.getCustomerPaymentMethods();
            this.hideModal("creditCardModal");
        }
    },
    mounted: function() {
        if (this.$root.apiKey == null) {
            this.$router.push({ name: 'login'});
        } else {
            this.homePath = storeConfig.homePath;
            this.getCustomerInfo();
            this.getCustomerAddresses();
            this.getCustomerPaymentMethods();
            this.getCountries();
            this.getRegions(STORE_COUNTRY);
            this.getLocale();
            this.getTimeZone();
            this.onAddressUpserted();
        }
    }
};
storeComps.AccountPageTemplate = getPlaceholderRoute("template_client_account", "AccountPage");

storeComps.CreateAccountPage = {
    name: "create-account",
    data: function() { return {
        homePath: "", accountInfo: {}, confirmPassword: "", errorMessage: "",
        axiosConfig: { headers: { "Content-Type": "application/json;charset=UTF-8", "Access-Control-Allow-Origin": "*",
                "moquiSessionToken":this.$root.moquiSessionToken } }
    }; },
    methods: {
        createAccount: function(event){
            event.preventDefault();
            var emailValidation = /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
            var hasNumber = '(?=.*[0-9])';
            // var hasLowercaseChar = '(?=.*[a-z])';
            // var hasUppercaseChar = '(?=.*[A-Z])';
            var hasSpecialChar = '(?=.*[\\W_])';
            var expreg = new RegExp('^' + hasNumber /* + hasLowercaseChar + hasUppercaseChar */ + hasSpecialChar + '.{8,35}$');

            if (this.accountInfo.firstName == null ||  this.accountInfo.firstName.trim() === ""
                  || this.accountInfo.lastName == null || this.accountInfo.lastName.trim() === ""
                  || this.accountInfo.emailAddress == null || this.accountInfo.emailAddress.trim() === ""
                  || this.accountInfo.newPassword == null || this.accountInfo.newPassword.trim() === ""
                  || this.confirmPassword == null || this.confirmPassword.trim() === "") {
                this.errorMessage = "Verify the required fields";
                return;
            }
            if (!expreg.test(this.accountInfo.newPassword)) {
                this.errorMessage = "The password must have at least 8 characters, including a special character and a number.";
                return;
            }
            if (!emailValidation.test(this.accountInfo.emailAddress)) {
                this.errorMessage = "Insert a valid email.";
                return;
            }
            if (this.accountInfo.newPassword.includes("<") || this.accountInfo.newPassword.includes(">")) {
                this.errorMessage = "The Password can not contain the character < or > ";
                return;
            }
            if (this.accountInfo.newPassword !== this.confirmPassword) {
                this.errorMessage = "Passwords do not match";
                return;
            }

            this.accountInfo.newPasswordVerify = this.confirmPassword;

            LoginService.createAccount(this.accountInfo, this.axiosConfig).then(function (data) {
                this.login(this.accountInfo.emailAddress, this.accountInfo.newPassword);
            }.bind(this)).catch(function (error) {
                if(!!error.response && !!error.response.headers){
                    this.axiosConfig.headers.moquiSessionToken = error.response.headers.moquisessiontoken;
                    this.$root.moquiSessionToken = error.response.headers.moquisessiontoken;
                }
                this.errorMessage = "An error occurred: " + error.response.data.errors;
            }.bind(this));
        },
        login: function(userName, password) {
            var user = { username: userName, password: password };
            LoginService.login(user, this.axiosConfig).then(function (data) {
                this.$root.apiKey = data.apiKey;
                this.$root.moquiSessionToken = data.moquiSessionToken;
                if(localStorage.redirect == 'checkout'){
                    localStorage.removeItem("redirect");
                    this.$router.push({ name: 'checkout'});
                }else{
                   this.$router.push({ name: 'account'}); 
                }
                
            }.bind(this)).catch(function (error) {
                if(!!error.response && !!error.response.headers){
                    this.axiosConfig.headers.moquiSessionToken = error.response.headers.moquisessiontoken;
                    this.$root.moquiSessionToken = error.response.headers.moquisessiontoken;
                }
                this.errorMessage = error.response.data.errors;
            }.bind(this));
        }
    },
    mounted: function() { 
        // If this user is logged in, send to account
        if(this.$root.apiKey != null) { 
            this.$router.push({ name: 'account' }); 
        } else {
            this.homePath = storeConfig.homePath;
        }
    },
};
storeComps.CreateAccountPageTemplate = getPlaceholderRoute("template_client_accountCreate", "CreateAccountPage");

storeComps.CustomerOrderPage = {
    name: "customerorder-page",
    data: function() { return {
        homePath: "", ordersList: [], orderList: {},
        axiosConfig: { headers: { "Content-Type": "application/json;charset=UTF-8", "Access-Control-Allow-Origin": "*",
                "api_key":this.$root.apiKey, "moquiSessionToken":this.$root.moquiSessionToken } }
    }; },
    methods: {
        getCustomerOrderById: function() {
            CustomerService.getCustomerOrderById(this.$route.params.orderId,this.axiosConfig).then(function (data) {
                this.orderList = data;
            }.bind(this));
        },
        getExpectedArrivalDate: function(tt) {
            var date = moment(tt);
            var newdate = new Date(date);

            newdate.setDate(newdate.getDate() + 7);
            
            var dd = newdate.getDate();
            var mm = newdate.getMonth();
            var yy = newdate.getFullYear();
            months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

            var newDATE = dd + ' ' + months[mm] + ', ' + yy.toString().substring(2);
            return  newDATE;
        },
        formatDate: function(dateArg) {
            return moment(dateArg).format('Do MMM, YY');
        }
    },
    mounted: function() { 
        if(this.$root.apiKey == null) { 
            this.$router.push({ name: 'login' }); 
        } else {
            this.getCustomerOrderById(); 
            this.homePath = storeConfig.homePath;
        }
    }
};
storeComps.CustomerOrderPageTemplate = getPlaceholderRoute("template_client_orderDetail", "CustomerOrderPage");

storeComps.CustomerOrdersPage = {
    name: "customerorders-page",
    data: function() { return {
        homePath: "", ordersList: [], listProduct: [],
        axiosConfig: { headers: { "Content-Type": "application/json;charset=UTF-8", "Access-Control-Allow-Origin": "*",
                "api_key":this.$root.apiKey, "moquiSessionToken":this.$root.moquiSessionToken } }
    }; },
    methods: {
        getCustomerOrders: function() {
            CustomerService.getCustomerOrders(this.axiosConfig).then(function (data) {
                this.ordersList = data.orderInfoList;
                this.getCustomerOrderById();
            }.bind(this));
        },
        getCustomerOrderById: function() {
            for (var x in this.ordersList) {
                CustomerService.getCustomerOrderById(this.ordersList[x].orderId,this.axiosConfig).then(function (data) {
                    var product = {
                        "orderId":data.orderItemList[0].orderId,
                        "listProduct":data.orderItemList
                    };
                    this.listProduct.push(product);
                }.bind(this));
            }
        },
        scrollTo: function(refName) {
            if (refName == null) {
                window.scrollTo(0, 0);
            } else {
                var element = this.$refs[refName];
                var top = element.offsetTop;
                window.scrollTo(0, top);
            }
        },
        formatDate: function(date) {
            return moment(date).format('Do MMM, YY');
        }
    },
    mounted: function() { 
        if(this.$root.apiKey == null) { 
            this.$router.push({ name: 'login' }); 
        } else {
            this.getCustomerOrders(); 
            this.homePath = storeConfig.homePath;
        }
    }
};
storeComps.CustomerOrdersPageTemplate = getPlaceholderRoute("template_client_orderHistory", "CustomerOrdersPage");
/* This software is in the public domain under CC0 1.0 Universal plus a Grant of Patent License. */
const STEP_ADDRESS = "shipping-address";
const STEP_SHIPPING = "shipping-method";
const STEP_BILLING = "payment-methods";
const STEP_REVIEW = "review-purchase";
const STEP_PENDING = "pending";
const STEP_SUCCESS = "success";
const STEPS = [STEP_ADDRESS, STEP_SHIPPING, STEP_BILLING, STEP_REVIEW, STEP_PENDING, STEP_SUCCESS];


storeComps.CheckoutNavbar = {
  name: "checkout-navbar",
  data: function() { return {STEP_ADDRESS: STEP_ADDRESS, STEP_SHIPPING: STEP_SHIPPING, STEP_BILLING: STEP_BILLING, STEP_REVIEW: STEP_REVIEW, STEP_PENDING: STEP_PENDING, STEP_SUCCESS: STEP_SUCCESS, STEPS: STEPS} },
  props: ["option"],
  methods: {
        getCurrentStep: function() {
            var step =  window.location.hash ? window.location.hash.split("/")[2] : this.STEP_ADDRESS;
            return  (this.STEPS.indexOf(step) > -1) ? step : this.STEP_ADDRESS;
        },
        setCurrentStep: function(step) {
            if (this.STEPS.indexOf(step) == -1)
                return;
            window.history.pushState('', 'ignored param', window.location.pathname + "#/checkout/"+step);
            var event = new CustomEvent("hashchange");
            window.dispatchEvent(event);
            this.$forceUpdate();
        },
        isCurrentStep: function(step) {
            return this.getCurrentStep() == step;
        },
        isCompleteStep: function(step) {
            return this.STEPS.indexOf(step) < this.STEPS.indexOf(this.getCurrentStep())
        },
        isIncompleteStep: function(step) {
            return this.STEPS.indexOf(step) >= this.STEPS.indexOf(this.getCurrentStep())
        }
    },
    mounted: function() {
        // Redirects to the address step if none found.
        var currentStep = this.getCurrentStep();
        if (!window.location.hash.indexOf(currentStep) > -1) {
            this.setCurrentStep(this.STEP_ADDRESS);
        }

        // Triggers a refresh if the hash changes
        var reference = this;
        window.addEventListener('hashchange', function() {
            reference.$forceUpdate()
        }, false);
    }
};


storeComps.CheckOutPage = {
    name: "checkout-page",
    extends: storeComps.CheckoutNavbar,
    data: function() { return {
            cvv: "", showCvvError: false, homePath: "", storePath: "", customerInfo: {}, productsInCart: {}, shippingAddress: {}, shippingAddressSelect: {}, paymentMethod: {}, shippingMethod: {}, showProp65: "false",
            billingAddress: {}, billingAddressOption: "", listShippingAddress: [], listPaymentMethods: [],  promoCode: "", promoError: "", postalAddressStateGeoSelected: null,
            countriesList: [], regionsList: [], shippingOption: "", addressOption: "", paymentOption: "", isSameAddress: "0", shippingItemPrice: 0,
            isUpdate: false, isSpinner: false, responseMessage: "", toNameErrorMessage: "", countryErrorMessage: "", addressErrorMessage: "", 
            cityErrorMessage: "", stateErrorMessage: "", postalCodeErrorMessage: "", contactNumberErrorMessage: "", paymentId: 0, 
            freeShipping:false, promoSuccess: "", loading: false,
            listShippingOptions: [],  axiosConfig: { headers: { "Content-Type": "application/json;charset=UTF-8", "Access-Control-Allow-Origin": "*",
            "api_key":this.$root.apiKey, "moquiSessionToken":this.$root.moquiSessionToken } }
        };
    },
    computed: {
        shippingPrice: function () {
            return this.shippingMethod && this.shippingMethod.shippingTotal != undefined ? Number(this.shippingMethod.shippingTotal) : this.shippingItemPrice;
        },
    },
    methods: {
        notAddressSeleted: function() {
            return (this.addressOption == null || this.addressOption == ''
                || this.listShippingAddress == null || this.listShippingAddress.length == 0);
        },
        notPaymentSeleted: function() {
            return (this.paymentOption == null || this.paymentOption == ''
                || this.listPaymentMethods == null || this.listPaymentMethods.length == 0);
        },
        getCustomerInfo: function() { CustomerService.getCustomerInfo(this.axiosConfig)
            .then(function (data) { this.customerInfo = data; }.bind(this)); },
        getCustomerShippingAddresses: function() {
            CustomerService.getShippingAddresses(this.axiosConfig).then(function (data) {
                this.listShippingAddress = data.postalAddressList || [];
                this.getCartInfo();
            }.bind(this));
        },
        onAddressCancel: function() {
            this.hideModal("addressFormModal");
        },

        onAddressUpserted: function(data) {
            this.shippingAddress = {};
            this.addressOption = data.postalContactMechId + ':' + data.telecomContactMechId;
            this.getCustomerShippingAddresses();
            this.hideModal("addressFormModal");
        },

        onCreditCardCancel: function() {
            this.hideModal("creditCardModal");
        },

        /**
         * Data is like so:
         * "postalContactMechId" : "CustJqpAddr",
         * "paymentMethodId" : "100004",
         * "telecomContactMechId" : "CustJqpTeln"
        **/
        onCreditCardSet: function(data) {
            this.getCustomerPaymentMethods();
            this.hideModal("creditCardModal");
        },

        getCartShippingOptions: function() {
            ProductService.getCartShippingOptions(this.axiosConfig)
                .then(function (data) {
                    this.listShippingOptions = data.shippingOptions;

                    for(var i in this.listShippingOptions){
                        if(!!this.listShippingOptions[i].shippingTotal){
                            this.listShippingOptions[i].shippingTotal = parseFloat(this.listShippingOptions[i].shippingTotal).toFixed(2);
                        }
                    }

                    // Look for shipping option
                    var option = this.listShippingOptions?
                               this.listShippingOptions.find(function(item) {return item.shipmentMethodDescription == "Ground Parcel"}):0;

                    // Update the shipping option value
                    if(!!option){
                        option.shippingTotal = parseFloat(this.shippingItemPrice).toFixed(2);
                        this.shippingOption = option.carrierPartyId + ':' + option.shipmentMethodEnumId;
                        this.shippingMethod = option;
                    }

                    this.loading = false;
                }.bind(this));
        },
        getRegions: function(geoId) { GeoService.getRegions(geoId).then(function (data){ this.regionsList = data.resultList; }.bind(this)); },
        getCartInfo: function() {
            ProductService.getCartInfo(this.axiosConfig).then(function (data) {
                if (data.postalAddress) {
                    this.postalAddressStateGeoSelected = data.postalAddressStateGeo;
                    this.addressOption = data.postalAddress.contactMechId + ':' + data.postalAddress.telecomContactMechId;
                    this.shippingAddressSelect = data.postalAddress;
                    this.shippingAddressSelect.contactNumber = data.telecomNumber.contactNumber;
                } else if (this.listShippingAddress.length) {
                    // Preselect first address
                    this.addressOption = this.listShippingAddress[0].postalContactMechId + ':' + this.listShippingAddress[0].telecomContactMechId;
                }

                if (data.paymentInfoList && data.paymentInfoList.length) {
                    this.paymentOption = data.paymentInfoList[0].payment.paymentMethodId;
                    this.billingAddressOption = data.paymentInfoList[0].paymentMethod.postalContactMechId + ':' +data.paymentInfoList[0].paymentMethod.telecomContactMechId;
                    this.selectBillingAddress(data.paymentInfoList[0]);
                    for(var x in this.listPaymentMethods) {
                        if(this.paymentOption === this.listPaymentMethods[x].paymentMethodId) {
                            this.selectPaymentMethod(this.listPaymentMethods[x]);
                            this.selectBillingAddress(this.listPaymentMethods[x]);
                            break;
                        }
                    }
                } else if (this.listPaymentMethods.length) {
                    // Preselect first payment option
                    this.paymentOption = this.listPaymentMethods[0].paymentMethodId;
                }

                this.productsInCart = data;
                this.setShippingItemPrice();
                this.afterDelete();
            }.bind(this));
        },
        setShippingItemPrice: function(){
            // Retrieve the ItemShipping from orderItemList
            var item = this.productsInCart.orderItemList?
                       this.productsInCart.orderItemList.find(function(item) {return item.itemTypeEnumId == 'ItemShipping'; }):0;
            // Parse the default value retrieved from orderItemList setting two decimal
            this.shippingItemPrice = parseFloat(item? item.unitAmount : 0);
        },
        addressContinue: function() {
            this.addCartBillingShipping();
            this.setCurrentStep(STEP_SHIPPING)
        },
        shippingContinue: function() {
            this.addCartBillingShipping();
            this.setCurrentStep(STEP_BILLING)
        },
        validateCvv: function () {
            var isCvvValid = new RegExp("^\\d{3,4}$").test(this.cvv);

            if (!isCvvValid) {
                this.showCvvError = true;

                return;
            }

            this.showCvvError = false;
            this.addCartBillingShipping();
            this.setCurrentStep(STEP_REVIEW)
        },
        addCartBillingShipping: function() {
            var info = {
                "shippingPostalContactMechId":this.addressOption.split(':')[0],
                "shippingTelecomContactMechId":this.addressOption.split(':')[1],
                "paymentMethodId":this.paymentOption,
                "carrierPartyId":this.shippingOption.split(':')[0],
                "shipmentMethodEnumId":this.shippingOption.split(':')[1]
            };
            ProductService.addCartBillingShipping(info,this.axiosConfig).then(function (data) {
                this.paymentId = data.paymentId;
                this.getCartInfo();
            }.bind(this));
        },
        getCustomerPaymentMethods: function() {
            CustomerService.getPaymentMethods(this.axiosConfig)
                .then(function (data) {
                    this.listPaymentMethods = data.methodInfoList;
                    this.getCartInfo();
            }.bind(this));
        },
        placeCartOrder: function() {
            var data = { cardSecurityCodeByPaymentId: {} };
            data.cardSecurityCodeByPaymentId[this.paymentId] = this.cvv;

            // temporarily go to sending step
            this.setCurrentStep(STEP_PENDING);
            ProductService.placeCartOrder(data,this.axiosConfig).then(function (data) {
                if(data.orderHeader != null) {
                    this.$router.push({ name: 'successcheckout', params: { orderId: data.orderHeader.orderId }});
                } else {
                    this.showModal("modal-error");
                    this.setCurrentStep(STEP_BILLING);
                }
                if(data.messages.includes("error") && data.messages.includes("122")) {
                    this.responseMessage = "Please provide a valid Billing ZIP";
                    this.setCurrentStep(STEP_BILLING);
                } else {
                    this.responseMessage = data.messages;
                }
            }.bind(this)).catch(function (error) {
                this.responseMessage = error;
                this.showModal("modal-error");
                this.setCurrentStep(STEP_BILLING);
            }.bind(this));
        },
        applyPromotionCode: function() {
            var dataCode = {promoCode: this.promoCode, orderId: this.productsInCart.orderHeader.orderId};
            ProductService.addPromoCode(dataCode,this.axiosConfig).then(function (data) {
                if(data.messages.includes("not valid")) {
                    this.promoError = data.messages;
                } else {
                    this.promoSuccess = data.messages;
                }
            }.bind(this));
        },
        deletePaymentMethod: function(paymentMethodId) {
            CustomerService.deletePaymentMethod(paymentMethodId,this.axiosConfig).then(function (data) {
                this.getCustomerPaymentMethods();
            }.bind(this));
        },
        deleteShippingAddress: function(contactMechId,contactMechPurposeId) {
            CustomerService.deleteShippingAddress(contactMechId,contactMechPurposeId, this.axiosConfig).then(function (data) {
                this.getCustomerShippingAddresses();
            }.bind(this));
        },
        updateProductQuantity: function(item) {
            this.loading = true;
            var data = { "orderId": item.orderId, "orderItemSeqId": item.orderItemSeqId, "quantity": item.quantity };
            ProductService.updateProductQuantity(data, this.axiosConfig)
                .then(function (data) { 
                    this.getCartInfo();
                    this.getCartShippingOptions();
                }.bind(this));
        },
        afterDelete: function(){
            let qtyProducts = 0 ;
            if (this.productsInCart.orderItemList) {
                this.productsInCart.orderItemList.forEach(function(item){
                    if(item.itemTypeEnumId == 'ItemProduct'){
                        qtyProducts += 1;
                    }
                });
            }
            if(qtyProducts == 0){
                window.location.href = this.storePath;
            }
        },
        deleteOrderProduct: function(item) {
            ProductService.deleteOrderProduct(item.orderId, item.orderItemSeqId, this.axiosConfig)
                .then(function (data) { this.getCartInfo(); }.bind(this));
        },
        selectBillingAddress: function(address) {
            this.paymentMethod.address1 = address.postalAddress.address1;
            this.paymentMethod.address2 = address.postalAddress.address2;
            this.paymentMethod.toName = address.postalAddress.toName;
            this.paymentMethod.attnName = address.postalAddress.attnName;
            this.paymentMethod.city = address.postalAddress.city;
            this.paymentMethod.countryGeoId = address.postalAddress.countryGeoId;
            if(typeof(address.telecomNumber) != 'undefined') {
                this.paymentMethod.contactNumber = address.telecomNumber.contactNumber;
            }
            this.paymentMethod.postalCode = address.postalAddress.postalCode;
            this.paymentMethod.stateProvinceGeoId = address.postalAddress.stateProvinceGeoId;
            this.responseMessage = "";
        },
        selectAddress: function(address) {
            this.shippingAddress = {};
            this.shippingAddress.address1 = address.postalAddress.address1;
            this.shippingAddress.address2 = address.postalAddress.address2;
            this.shippingAddress.toName = address.postalAddress.toName;
            this.shippingAddress.attnName = address.postalAddress.attnName;
            this.shippingAddress.city = address.postalAddress.city;
            this.shippingAddress.countryGeoId = address.postalAddress.countryGeoId;
            this.shippingAddress.contactNumber = address.telecomNumber.contactNumber;
            this.shippingAddress.postalCode = address.postalAddress.postalCode;
            this.shippingAddress.stateProvinceGeoId = address.postalAddress.stateProvinceGeoId;
            this.shippingAddress.postalContactMechId = address.postalContactMechId;
            this.shippingAddress.telecomContactMechId = address.telecomContactMechId;
            this.responseMessage = "";
        },
        selectPaymentMethod: function(method) {
            this.paymentMethod = {};
            this.paymentMethod.paymentMethodId = method.paymentMethodId;
            this.paymentMethod.description = method.paymentMethod.description;
            this.paymentMethod.paymentMethodTypeEnumId = method.paymentMethod.PmtCreditCard;
            this.paymentMethod.cardNumber = method.creditCard.cardNumber;
            this.paymentMethod.titleOnAccount = method.paymentMethod.titleOnAccount;
            this.paymentMethod.expireMonth = method.expireMonth;
            this.paymentMethod.expireYear = method.expireYear;
            this.paymentMethod.cardSecurityCode = "";
            this.paymentMethod.postalContactMechId = method.paymentMethod.postalContactMechId;
            this.paymentMethod.telecomContactMechId = method.paymentMethod.telecomContactMechId;
            this.responseMessage = "";
        },
        hideModal: function(modalId) { $('#'+modalId).modal('hide'); },
        showModal: function(modalId) { $('#'+modalId).modal('show'); },
        changeShippingAddress: function(data) {
            this.shippingAddressSelect = data.postalAddress;
            this.shippingAddressSelect.contactNumber = data.telecomNumber.contactNumber;
            this.postalAddressStateGeoSelected = {geoName: data.postalAddressStateGeo.geoName};
        },
        cleanShippingAddress: function() { this.shippingAddress = {}; this.isUpdate = false; },
        cleanPaymentMethod: function() { this.paymentMethod = {}; this.isUpdate = false; },
        resetData: function(){
            $("#modal-card-content").trigger('reset');
            this.paymentMethod = {};
            this.shippingAddress = {};
            this.isUpdate = false;
            this.shippingAddress.countryGeoId = 'USA';
        },
        clearCvv: function () {
            this.cvv = "";
        },
    },
    components: { "product-image": storeComps.ProductImageTemplate },
    mounted: function() {
        this.loading = true;

        if (this.$root.apiKey == null) {
            localStorage.redirect = 'checkout';
            this.$router.push({ name: 'login'});
        } else {
            this.homePath = storeConfig.homePath;
            this.storePath = storeConfig.storePath;
            this.showProp65 = storeConfig.show_prop_65_warning;
            this.getCustomerInfo();
            this.getCartShippingOptions();
            this.getCustomerShippingAddresses();
            this.getCustomerPaymentMethods();
            this.getRegions('USA');  
        }
    }
};
storeComps.CheckOutPageTemplate = getPlaceholderRoute("template_client_checkout", "CheckOutPage");

storeComps.SuccessCheckOut = {
    name: "success-checkout",
    data: function() { return {
        customerInfo: {}, deliveryPrice:0, ordersList:[], orderList:{},
        axiosConfig: { headers: { "Content-Type": "application/json;charset=UTF-8", "Access-Control-Allow-Origin": "*",
                "api_key":this.$root.apiKey, "moquiSessionToken":this.$root.moquiSessionToken } }
    }; },
    methods: {
        getCustomerInfo: function() { CustomerService.getCustomerInfo(this.axiosConfig)
            .then(function (data) { this.customerInfo = data; }.bind(this)); },
        getCustomerOrders: function() {
            CustomerService.getCustomerOrders(this.axiosConfig)
                .then(function (data) { this.ordersList = data.orderInfoList; }.bind(this));
        },
        getCustomerOrderById: function() {
            CustomerService.getCustomerOrderById(this.$route.params.orderId,this.axiosConfig)
                .then(function (data) {
                    this.orderList = data;
                    var event = new CustomEvent("ordercomplete", { 'detail': data });
                    window.dispatchEvent(event);
                }.bind(this));
        },
        formatDate: function(date) {
            return moment(date).format('Do MMM, YY');
        }
    },
    components: { "product-image": storeComps.ProductImageTemplate },
    mounted: function() {
        this.homePath = storeConfig.homePath;
        this.getCustomerInfo();
        this.getCustomerOrderById();
    }
};
storeComps.SuccessCheckOutTemplate = getPlaceholderRoute("template_client_checkoutSuccess", "SuccessCheckOut");

storeComps.CheckoutContactInfoTemplate = getPlaceholderRoute("template_client_contactInfo", "contactInfo");
Vue.component("contact-info", storeComps.CheckoutContactInfoTemplate);

storeComps.CheckoutProp65Template = getPlaceholderRoute("template_client_prop65", "prop65Warning");
Vue.component("prop65-warning", storeComps.CheckoutProp65Template);

storeComps.CheckoutNavbarTemplate = getPlaceholderRoute("template_client_checkoutHeader", "CheckoutNavbar", storeComps.CheckoutNavbar.props);
Vue.component("checkout-navbar", storeComps.CheckoutNavbarTemplate);
/* This software is in the public domain under CC0 1.0 Universal plus a Grant of Patent License. */
var preLoginRoute = {};
var appObjects = {
    // see https://router.vuejs.org/en/essentials/history-mode.html
    // for route path expressions see https://router.vuejs.org/en/essentials/dynamic-matching.html AND https://github.com/vuejs/vue-router/blob/dev/examples/route-matching/app.js
    router: new VueRouter({
        // TODO sooner or later: base: storeConfig.basePath, mode: 'history',
        routes: [
            { path: "/login", name: "login", component: storeComps.LoginPageTemplate, 
               beforeEnter: function(to, from, next){
                    preLoginRoute = from;
                    next();
               } },
            { path: "/checkout/:step?", name: "checkout", component: storeComps.CheckOutPageTemplate },
            { path: "/checkout/success/:orderId", name: "successcheckout", component: storeComps.SuccessCheckOutTemplate },
            { path: "/orders/:orderId", name: "order", component: storeComps.CustomerOrderPageTemplate },
            { path: "/orders", name: "orders", component: storeComps.CustomerOrdersPageTemplate },
            { path: "/account", name: "account", component: storeComps.AccountPageTemplate },
            { path: "/account/create", name: "createaccount", component: storeComps.CreateAccountPageTemplate },
            { path: "/resetPassword", name: "resetPassword", component: storeComps.ResetPasswordTemplate }
        ]
    }),
    App: {
        name: "app",
        template: '<div id="app"><router-view></router-view></div>',
        data: function() { return {}; }, components: {}
    }
};

const fixIdScrolling = {
    watch: {
        $route: function(to, from) {
            const currentRoute = this.$router.currentRoute;
            const idToScrollTo = currentRoute.hash;
            this.$nextTick(function(){
                if (idToScrollTo && document.querySelector(idToScrollTo)) {
                    document.querySelector(idToScrollTo).scrollIntoView();
                }
            });
        },
    },
};
// TODO: leave this, reminder to use vue.min.js for production: Vue.config.productionTip = false;

var storeApp = new Vue({
    mixins: [fixIdScrolling],
    el: "#app",
    router: appObjects.router,
    // state: { categories: [], user: null },
    data: {
        storeComps: storeComps, storeConfig: storeConfig,
        storeInfo: storeInfo, categoryList: storeInfo.categoryList, categoryByType: storeInfo.categoryByType,
        preLoginRoute: null,
        // apiKey null unless user is logged in
        apiKey: null,
        // session token for all non-get requests when no user is logged in (no api_key is passed)
        moquiSessionToken: null,
        // userInfo null unless user is logged in, then has response from /customer/info
        customerInfo: storeInfo.customerInfo,
        cartInfo: null
    },
    template: "<App/>",
    components: { App:appObjects.App },
    mounted: function () {
        if (this.storeConfig.storeName && this.storeConfig.storeName.length) document.title = this.storeConfig.storeName;
        var storeInfo = this.storeInfo;
        if (storeInfo.apiKey && storeInfo.apiKey.length) { this.apiKey = storeInfo.apiKey; storeInfo.apiKey = null; }
        if (storeInfo.moquiSessionToken && storeInfo.moquiSessionToken.length) {
            this.moquiSessionToken = storeInfo.moquiSessionToken; storeInfo.moquiSessionToken = null; }
        if (storeInfo.customerInfo && storeInfo.customerInfo.partyId) {
            this.customerInfo = storeInfo.customerInfo; storeInfo.customerInfo = null; }
    }
});
