class A {
    
   
    makeB() {
        console.log(new B())
    }
}

class E {
    constructor() {
        console.log('EEEE')
    }
}
class B {
    e
    constructor() {
        this.e = new E()
        console.log('new e made')
    }
}



let a = new A()
a.makeB()