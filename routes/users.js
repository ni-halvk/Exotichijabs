const { response } = require('express');
var express = require('express');
const collection = require('../config/collection');
const adminhelpers = require('../helpers/adminhelpers');
const producthelpers = require('../helpers/producthelpers');
var router = express.Router();
var Handlebars = require('handlebars');
const userhelpers = require('../helpers/userhelpers')
require("dotenv").config()


const accountSid = process.env.OTP_ACCOUNT_SID;
const authToken = process.env.OTP_AUTH_TOKEN;
const serviceId = process.env.OTP_SERVICE_ID

// const accountSid = 'AC15add6ac693833e1e00f2d600cccf678';
// const authToken = '93c96abed3d26a6a22d9ae8e2c021241';
// const serviceId = "VA4c79484d8c15cb91629c185adacb4c30";
const client = require('twilio')(accountSid, authToken);
const paypal = require('paypal-rest-sdk')

paypal.configure({
  'mode': 'sandbox', //sandbox or live 
  'client_id': process.env.PAYPAL_CLIENTID, // please provide your client id here 
  'client_secret': process.env.PAYPAL_SECRETID // provide your client secret here 
});


// ============================== Login ======================================= //

const verifyUser = (req, res, next) => {
  if (req.session.user) {
    next()
  } else {
    res.redirect('/login')
  }
}

/* GET home page. */
router.get('/', async function (req, res, next) {

  let banner;
  const perPage = 16;
  let pageNum;
  let skip;
  let productCount;
  let pages;
  pageNum = parseInt(req.query.page) >= 1 ? parseInt(req.query.page) : 1;
  console.log(typeof (pageNum))
  skip = (pageNum - 1) * perPage
  await producthelpers.getProductCount().then((count) => {
    productCount = count;
  })
  pages = Math.ceil(productCount / perPage)

  Handlebars.registerHelper('ifCond', function (v1, v2, options) {
    if (v1 === v2) {
      return options.fn(this);
    }
    return options.inverse(this);
  });
  Handlebars.registerHelper('for', function (from, to, incr, block) {
    var accum = '';
    for (var i = from; i <= to; i += incr)
      accum += block.fn(i);
    return accum;
  });


  let user = req.session.user
  let cartCount = null
  if (user) {
    cartCount = await userhelpers.getcartCount(req.session.user._id)
  }

  let category = await producthelpers.GetallCategory(req.body)
  try {
    await adminhelpers.getActiveBanner().then((activeBanner) => {
      banner = activeBanner
    }).catch((err) => {
      console.log('error in home', err);
      res.redirect('/err')
    })

    await producthelpers.getPaginatedProducts(skip, perPage).then((products) => {
      if (user) {
        userhelpers.getWishlistId(user._id).then((data) => {
          for (let i = 0; i < products.length; i++) {
            for (let j = 0; j < data.length; j++) {

              if (products[i]._id.toString() == data[j].toString()) {
                products[i].isWishlisted = true;
                console.log(products[i], 'hai');
              }

            }
          }
          res.render('user/index', { admin: false, user, totalDoc: productCount, currentPage: pageNum, pages: pages, products, category, cartCount, banner });
        }).catch((err) => {
          console.log('error in home', err);
          res.redirect('/err')
        })
      } else {
        res.render('user/index', { admin: false, products, category, cartCount, banner, totalDoc: productCount, currentPage: pageNum, pages: pages });
      }
    }).catch((err) => {
      console.log('error in home', err);
      res.redirect('/err')
    })
  } catch (err) {
    console.log('error in home', err);
    res.redirect('/err')
  }
});


router.get('/login', (req, res) => {
  let user = req.session.user
  if (user) {
    res.redirect('/');
  } else {
    res.render('user/Login', { passwordErr: req.session.loginErr, blockedErr: req.session.loginBlocked });
    req.session.loginErr = null
    req.session.loginBlocked = null
  }

});

router.get('/signup', (req, res) => {
  res.render('user/signup', { signupError: req.session.Err, Emailerr: req.session.Emailerr })
  req.session.Err = null
  req.session.Emailerr = null
});


router.post('/signup', (req, res) => {
  console.log(req.body);
  if (req.body.password === req.body.confirmpassword) {
    console.log(req.body);
    userhelpers.doSignup(req.body).then(() => {
      res.redirect('/login')
    }).catch((error) => {
      req.session.Emailerr = error
      res.redirect('/signup');
    })
  } else {
    req.session.Err = 'password must be same'
    res.redirect('/signup');
  }
});


router.post('/login', (req, res) => {
  userhelpers.doLogin(req.body).then((response) => {
    console.log('hi');
    console.log(response);
    if (response.status) {
      userhelpers.isLogin(response.user._id).then(() => {
        if (response.status) {
          req.session.loggedIn = true
          req.session.user = response.user
          res.redirect('/');
        }
      }).catch((error) => {
        req.session.loginBlocked = error
        res.redirect('/login');
      })
    } else {
      req.session.loginErr = 'invalid credintials'
      res.redirect('/login');
    }
  })
});

//logout
router.get('/logout', (req, res) => {
  req.session.destroy()
  res.redirect('/cart')
})


// ============================= O T P ======================  //

router.get('/otp-login', (req, res) => {
  res.render('user/otplogin', { otpErr: req.session.numberExist })
  req.session.numberExist = null
})

router.get('/otp', (req, res) => {
  res.render('user/pin', { errOTP: req.session.otpError })
  req.session.otpError = null
})


router.post('/send-otp', (req, res) => {
  try {
    userhelpers.checkMobileNumber(req.body.number).then((response) => {
      console.log(response, 'response');
      if (response) {
        console.log('hey api');
        let mobileNumber = (`+91${req.body.number}`);
        req.session.Phoneno = mobileNumber;
        req.session.mobile = req.body.number;
        client.verify.v2.services(serviceId)
          .verifications
          .create({ to: mobileNumber, channel: 'sms' })
          .then((verification) => {
            console.log(verification.status);
            req.session.otpSended = true
            res.redirect('/otp')
          }).catch((err) => {
            console.log(err, 'error');
          })
      }
      else {
        req.session.numberExist = "Could not find any user with this Number!"
        console.log('numberExist')
        res.redirect('/otp-login')
      }
    })
  } catch (err) {
    console.log('error in OTP', err);
    res.redirect('/err')
  }
})


router.post('/confirm-otp', (req, res) => {
  try {
    userhelpers.checkMobileNumber(req.session.mobile).then((response) => {
      console.log(response, 'confirm response');
      let mobileNumber = req.session.Phoneno
      let otp = req.body.otp;
      console.log(otp)
      client.verify.v2.services(serviceId)
        .verificationChecks
        .create({ to: mobileNumber, code: otp })
        .then((verification_check) => {
          console.log(verification_check.status)
          if (verification_check.status == 'approved') {
            console.log('otp approved')
            req.session.user = response
            res.redirect('/')
          } else {
            console.log('otp rejected')
            req.session.otpSended = true
            req.session.otpError = "Invalid OTP!"
            res.redirect('/otp')
          }
        })
    })
  } catch (err) {
    console.log('error in OTP', err);
    res.redirect('/err')
  }
})


// ============================= Category ====================== //

router.get('/view-category/:id', async (req, res) => {
  let user = req.session.user
  let category = await producthelpers.GetallCategory(req.body)
  try {
    userhelpers.getCategoryproducts(req.params.id).then((product) => {
      console.log(product);
      res.render('user/shop', { admin: false, user, product, category })
    }).catch((err) => {
      console.log('error in Cat', err);
      res.redirect('/err')
    })
  } catch (err) {
    console.log('error in Cat', err);
    res.redirect('/err')
  }
});


// ============================= product details page ====================== //

router.get('/productDetails/:id', verifyUser, async (req, res) => {
  let user = req.session.user
  if (user) {
    cartCount = await userhelpers.getcartCount(req.session.user._id)
  }
  let category = await producthelpers.GetallCategory(req.body)
  try {
    userhelpers.productDetails(req.params.id).then((product) => {
      res.render('user/products-details', { admin: false, user, product, category, cartCount })
    }).catch((err) => {
      console.log('error in Product', err);
      res.redirect('/err')
    })
  } catch (err) {
    console.log('error in Product', err);
    res.redirect('/err')
  }
});


// ============================= Cart ======================  //

router.get('/cart', verifyUser, async (req, res) => {
  let user = req.session.user
  let products = await userhelpers.getcartProducts(req.session.user._id)
  try {
    if (products.length > 0) {
      let total = await userhelpers.getTotalprice(req.session.user._id)
      res.render('user/cart', { 'user': req.session.user._id, products, total })

    }
    else
      res.render('user/cart', { 'user': req.session.user._id, products })
  } catch (err) {
    console.log('error in cart', err);
    res.redirect('/err')
  }
});


router.get('/addtocart/:id', (req, res) => {
  userhelpers.addtoCart(req.params.id, req.session.user._id).then(() => {
    res.json({ status: true })
  })
});

router.post('/change-productQuantity', (req, res) => {
  userhelpers.changeproductQuantity(req.body).then(async (response) => {
    response.total = await userhelpers.getTotalprice(req.body.user)
    res.json(response)
  })
})

router.post('/delete-cartProduct', (req, res) => {
  let cartProid = req.body
  try {
    userhelpers.deletecartProduct(cartProid).then((response) => {
      res.json(response)

    }).catch((err) => {
      console.log('error in deletecartPto', err);
      res.redirect('/err')
    })
  } catch (err) {
    console.log('error in delcartPro', err);
    res.redirect('/err')
  }
});


// ============================= CheckOut ====================== //

router.get('/proceedTo-checkout', verifyUser, async (req, res) => {
  let user = req.session.user
  let coupon = await producthelpers.getAllCoupons()
  let address = await userhelpers.getAlladdress(req.session.user._id)
  let total = await userhelpers.getTotalprice(req.session.user._id)
  let wallet = await userhelpers.getWallet(req.session.user._id)
  if (wallet.amount > total) {
    walletview = true
  } else {
    walletview = false
  }
  try {
    res.render('user/placeorder', { total, user, address, coupon, coupErr: req.session.couponErr, walletview, wallet });
  } catch (err) {
    console.log('error in checkout', err);
    res.redirect('/err')
  }
  req.session.couponErr = null
});

router.post('/checkout', verifyUser, async (req, res) => {
  if (req.body.flexRadioDefault == "new") {
    await userhelpers.addAddressfromOrder(req.body, req.session.user)
  }
  let products = await userhelpers.getcartProductlist(req.body.userId)
  let totalprice = await userhelpers.getTotalprice(req.body.userId)
  let userid = req.body.userId

  //coupon
  if (req.body.couponName) {
    console.log('api callllll');
    totalprice = await userhelpers.getTotalprice(req.body.userId)
    let discountPrice = await userhelpers.promoOffer(req.body.couponName, totalprice)
    totalprice = totalprice - discountPrice
  } else {
    totalprice = await userhelpers.getTotalprice(req.body.userId)
  }

  //adding address
  let address = {}
  if (req.body.flexRadioDefault == 'new') {
    address = req.body
  }
  else {
    await userhelpers.getUserAddress(req.session.user, req.body.flexRadioDefault).then((address1) => {
      address = address1
    })
  }

  //order placing
  try {
    await userhelpers.placeOrder(req.body, address, products, totalprice, req.session.user._id).then(async (orderId) => {
      if (req.body['paymentMethod'] == 'COD') {
        res.json({ COD_success: true })
      }
      //razorpay
      else if (req.body['paymentMethod'] == 'razorpay') {
        console.log('api call');
        await userhelpers.generateRazorpay(orderId, totalprice).then((response) => {
          response.razorpayMethod = true
          res.json(response)
        }).catch((err) => {
          console.log('error in Razorpay', err);
          res.redirect('/err')
        })
      }
      //paypal
      else if (req.body['paymentMethod'] == 'paypal') {
        var payment = {
          "intent": "authorize",
          "payer": {
            "payment_method": "paypal"
          },
          "redirect_urls": {
            "return_url": "http://127.0.0.1:3000/orderplaced",
            "cancel_url": "http://127.0.0.1:3000/err"
          },
          "transactions": [{
            "amount": {
              "total": totalprice,
              "currency": "USD"
            },
            "description": " a book on mean stack "
          }]
        }

        userhelpers.createPay(payment).then((transaction) => {
          var id = transaction.id;
          var links = transaction.links;
          var counter = links.length;
          while (counter--) {
            if (links[counter].method == 'REDIRECT') {
              // redirect to paypal where user approves the transaction 
              // return res.redirect( links[counter].href )
              transaction.readytoredirect = true
              transaction.redirectLink = links[counter].href
              transaction.orderId = orderId

              userhelpers.changePaymentstatus(orderId).then(() => {
                res.json(transaction)
              })
            }
          }
        })
        //wallet
      } else if (req.body['paymentMethod'] == 'wallet') {
        userhelpers.useWallet(userid, totalprice)
        res.json({ COD_success: true })
      }
    }).catch((err) => {
      console.log('error in Placeorder', err);
      res.redirect('/err')
    })
  } catch (err) {
    console.log('error in PlaceOrder', err);
    res.redirect('/err')
  }
})


router.post('/verify-payment', (req, res) => {
  try {
    userhelpers.verifyPayment(req.body).then(() => {
      userhelpers.changePaymentstatus(req.body['order[receipt]']).then(() => {
        res.json({ status: true })
      })
    }).catch((err) => {
      res.json({ status: false })
    })
  } catch (err) {
    console.log('error in verify', err);
    res.redirect('/err')
  }
})

router.get('/delete-saveAddress/:id', verifyUser, (req, res) => {
  try {
    userhelpers.deleteAddress(req.params.id, req.session.user).then(() => {
      res.redirect('/proceedTo-checkout')
    })
  } catch (err) {
    console.log('error in Del', err);
    res.redirect('/err')
  }
})

router.get('/orderplaced', async (req, res) => {
  let category = await producthelpers.GetallCategory(req.body)
  let user = req.session.user
  res.render('user/orderplaced', { category, user })
})



// ============================= Orders List ====================== //

router.get('/orders', verifyUser, async (req, res) => {
  let category = await producthelpers.GetallCategory(req.body)
  let user = req.session.user
  if (user) {
    cartCount = await userhelpers.getcartCount(req.session.user._id)
  }
  let orders = await userhelpers.getallOrders(req.session.user._id)
  try {
    res.render('user/orders', { user, orders, cartCount, category })
  } catch (err) {
    console.log('error in orderslist', err);
    res.redirect('/err')
  }
})

router.get('/view-orderedProducts/:id', verifyUser, async (req, res) => {
  let category = await producthelpers.GetallCategory(req.body)
  let user = req.session.user
  if (user) {
    cartCount = await userhelpers.getcartCount(req.session.user._id)
  }
  let products = await userhelpers.getOrderproducts(req.params.id)
  let order = await userhelpers.getOrder(req.params.id)
  try {
    if (order.status == 'placed') {
      res.render('user/vieworderpro', { products, user, cartCount, category, order, placed: true })
    }
    else if (order.status == 'shipped') {
      res.render('user/vieworderpro', { products, user, cartCount, category, order, shipped: true })
    }
    else if (order.status == 'out for Delivery') {
      res.render('user/vieworderpro', { products, user, cartCount, category, order, delivered: true })
    }
    else if (order.status == 'cancelled') {
      res.render('user/vieworderpro', { products, user, cartCount, category, order, cancelled: true })
    }
    else if (order.status == 'Return requested') {
      res.render('user/vieworderpro', { products, user, cartCount, category, order, returned: true })
    }
  } catch (err) {
    console.log('error in vieworder', err);
    res.redirect('/err')
  }
});


router.get('/cancel-Order/:id', async (req, res) => {
  try {
    await userhelpers.cancelOrders(req.params.id).then(() => {
      res.redirect('/orders')
    }).catch((err) => {
      console.log('error in cancleOrder', err);
      res.redirect('/err')
    })
  } catch (err) {
    console.log('error in home', err);
    res.redirect('/err')
  }
})

router.get('/return-Order/:id', async (req, res) => {
  try {
    await userhelpers.returnOrder(req.params.id).then(() => {
      res.redirect('/orders')
    }).catch((err) => {
      console.log('error in home', err);
      res.redirect('/err')
    })
  } catch (err) {
    console.log('error in home', err);
    res.redirect('/err')
  }
})

// ============================= Profile ====================== //

router.get('/profile', verifyUser, async (req, res) => {
  let category = await producthelpers.GetallCategory(req.body)
  let user = req.session.user
  if (user) {
    cartCount = await userhelpers.getcartCount(req.session.user._id)
  }
  let userDetails = await userhelpers.userDetails(req.session.user._id)
  let address = await userhelpers.getProfileaddress(req.session.user._id)
  let orders = await userhelpers.getallOrders(req.session.user._id)
  let wallet = await userhelpers.getWallet(req.session.user._id)
  try {
    userhelpers.getUserdetails(req.session.user._id).then((users) => {
      res.render('user/profile', { user, users, address, orders, cartCount, category, userDetails, wallet })
    }).catch((err) => {
      console.log('error in Profile', err);
      res.redirect('/err')
    })
  } catch (err) {
    console.log('error in Profile', err);
    res.redirect('/err')
  }
})

router.post('/addAddress', verifyUser, async (req, res) => {
  try {
    userhelpers.addAddress(req.body, req.session.user)
    res.redirect('/profile')
  } catch (err) {
    console.log('error in Addaddress', err);
    res.redirect('/err')
  }
})

router.get('/delete-address/:id', verifyUser, (req, res) => {
  try {
    userhelpers.deleteAddress(req.params.id, req.session.user).then(() => {
      res.redirect('/profile')
    }).catch((err) => {
      console.log('error in delAddress', err);
      res.redirect('/err')
    })
  } catch (err) {
    console.log('error in Deladdress', err);
    res.redirect('/err')
  }
})

router.post('/edit-user/:id', (req, res) => {
  try {
    userhelpers.updateUser(req.params.id, req.body).then(() => {
      res.redirect('/profile')
    }).catch((err) => {
      console.log('error in edituser', err);
      res.redirect('/err')
    })
  } catch (err) {
    console.log('error in edituser', err);
    res.redirect('/err')
  }
})



// ============================= WishList ====================== //

router.get('/wishlist', verifyUser, async (req, res) => {
  let user = req.session.user
  if (user) {
    cartCount = await userhelpers.getcartCount(req.session.user._id)
  }
  let products = await userhelpers.getwishlistProducts(req.session.user._id)
  try {
    res.render('user/wishlist', { user, products, cartCount })
  } catch (err) {
    console.log('error in wishlist', err);
    res.redirect('/err')
  }
})

router.get('/add-to-wishlist/:id', (req, res) => {
  try {
    userhelpers.addtoWishlist(req.params.id, req.session.user._id).then(() => {
      res.redirect('/')
    }).catch((err) => {
      console.log('error in addWish', err);
      res.redirect('/err')
    })
  } catch (err) {
    console.log('error in Addwish', err);
    res.redirect('/err')
  }
})

router.post('/delete-wishPro', (req, res) => {
  try {
    userhelpers.deleteWishPro(req.body).then((response) => {
      res.json(response)
    }).catch((err) => {
      console.log('error in deletewish', err);
      res.redirect('/err')
    })
  } catch (err) {
    console.log('error in deleteWish', err);
    res.redirect('/err')
  }
})


// ============================= Coupon ====================== //

router.post('/couponApplied', (req, res) => {
  try {
    userhelpers.couponOffer(req.body).then((response) => {
      if (response.couponErr == true) {
        console.log('hi err');
        req.session.couponErr = `You want to purchase over ₹ ${response.couponmin}`
      } if (response.couponErr1 == true) {
        console.log('hi1 err');
        req.session.couponErr = 'invalid Coupon'
      }
      res.json(response)
    }).catch((err) => {
      console.log('error in coupon', err);
      res.redirect('/err')
    })
  } catch (err) {
    console.log('error in coupon', err);
    res.redirect('/err')
  }
})

// ============================= shop banner ====================== //

router.get('/shop', (req, res) => {
  try {
    producthelpers.getAllproducts().then((products) => {
      res.render('user/shopnew', { products })
    }).catch((err) => {
      console.log('error in shop', err);
      res.redirect('/err')
    })
  } catch (err) {
    console.log('error in shop', err);
    res.redirect('/err')
  }
})


// ============================= Error Page ====================== //

router.get('/err', (req, res) => {
  res.render('user/err')
})

// ===================================================================== //

module.exports = router;



