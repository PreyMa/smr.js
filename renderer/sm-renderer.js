(function() {
  function DefaultException( str, i, m= null ) {
    class DefaultException {
      constructor( str, i ) {
        this.str= str;
        this.pos= i;
        this.msg= m;
        this.err= Error();
      }

      msg() {
        let s= this.msg+ '\n';
        s+= this.str+ '\n';
        return s+ ''.padStart(this.pos, '~') + '^';
      }

      print() {
        console.error( this.msg() );
      }
    }

    return new DefaultException( str, i );
  }

  class ArrayIterator {
    constructor( a ) {
      this.arr= a;
      this.pos= 0;
    }

    isEnd() { return this.pos >= this.arr.length; }
    next() { this.pos++; }
    get() { return this.arr[this.pos]; }
    set( v ) { return this.arr[this.pos]= v; }

    extract() {
      return this.arr.splice( this.pos, 1 )[0];
    }
  }

  function escapeRegExp(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  }

  function insertAt(a, b, position) {
    return [a.slice(0, position), b, a.slice(position)].join('');
  }

  function moduleWrapper( config ) {
    let def= Object.assign({
      ExceptionType: DefaultException
    }, config );

    // Sync global object (browser)
    Object.assign( config, def );

    const SyntaxError= config.ExceptionType;


    /*
    * Parser Class
    *
    */
    class ParserRegex {
      static build( inp, propName ) {
        // find all symbols with property
        const arr= [];
        inp.forEach( s => {
            const prop= s[propName];
            if( prop ) {

              // Add counter
              s._ctr= 0;

              // create key-object entry
              if( Array.isArray(prop) ) {
                prop.forEach( key => {
                  arr.push( {key, sym: s} );
                });
              } else {
                arr.push( {key: prop, sym: s} );
              }
            }
        });

        // reverse sort by key length
        arr.sort( (a, b) => b.key.length- a.key.length );

        // escape to regex
        let str= '(';
        arr.forEach( (s, i) => {
          // Add number to groupname if necessary to ensure uniqueness
          const c= s.sym._ctr++ ? s.sym._ctr : '';

          // Append as group with unique name
          str+= '(?<'+ s.sym.name+ c+ '>'+ escapeRegExp( s.key )+ ')';
          if( i != arr.length-1 ) {
            str+= '|';
          }
        });
        str+= ')';

        // make regex expression
        return new ParserRegex( str, arr );
      }

      constructor( str, a= null ) {
        this.str= str;
        this.arr= a;
        this.regex= RegExp( str, 'g' );
      }

      source() {
        return this.str;
      }

      grouplessSource( name= null ) {
        if( name ) {
          return insertAt( this.str.replace(/\(\?\<\w+\>([^\)]+)\)/g, '$1'), `?<${name}>`, 1 );
        }
        return this.str.replace(/\(\?\<\w+\>(\w+)\)/g, '$1');
      }

      match( string ) {
        return string.matchAll( this.regex );
      }

      matchLookup( string ) {
        // Get Regex Iterator and check if it has a value
        const x= string.matchAll( this.regex ).next();
        if( x.done ) {
          return null;
        }

        // instead of lastIndexOf
        const v= x.value;
        let idx;
        for( idx= v.length-1; idx > 1; idx-- ) {
          if( v[idx] ) {
            break;
          }
        }
        idx-= 2;

        // Check if there is a symbol in the lookup table
        if( idx < 0 || idx >= this.arr.length ) {
          throw null;
        }

        return this.arr[idx].sym;
      }
    }


    /*
    *
    *
    */
    class MathElement {
      constructor() {}

      isSym( symbol ) { return false; }

      print() { throw Error('Abstract'); }
    }

    class MathLineElement extends MathElement {
      constructor() {
        super();
      }

      print() {
        // Print boilerplate
        // Calls print body
      }
    }

    class MathSymbol extends MathLineElement {
      constructor( s ) {
        super();
        this.sym= s;
      }

      isSym( symbol ) {
        if( symbol ) {
          return this.sym === symbol;
        }

        return true;
      }

      isParOpen() { return this.sym.exp === Renderer.ParType.Open; }

      isParClose() { return this.sym.exp === Renderer.ParType.Close; }

      isUnary() { return this.sym.unary; }

      isBinary() { return this.sym.binary; }

      printBody() {
        // Called by parent
      }
    }

    class MathVariable extends MathLineElement {
      constructor( s ) {
        super();
        this.text= s;
      }

      printBody() {
        // Called by parent
      }
    }

    class MathNumber extends MathLineElement {
      constructor( s ) {
        super();
        this.num= s;
      }

      printBody() {
        // Called by parent
      }
    }

    class MathExpression extends MathElement {
      constructor( it ) {
        super();

        this.children= [];

        if( it instanceof MathElement ) {
          this.children.push( it );

        } else {
          this.init( it );

          this.loadExp( it );
        }
      }

      init( it ) {}
      shouldStop() { return false; }

      loadSimpleExp( it ) {
        if( it.isEnd() ) {
          return null;
        }

        const cur= it.get();
        if( cur.isSym() ) {
          // lEr
          if( cur.isParOpen() ) {
            return new MathParenthesis( it );

          // uS
          } else if( cur.isUnary() ) {
            it.next();
            const arg= this.loadSimpleExp( it );
            return new MathUnaryCommand( it, cur, arg );

          // bSS
          } else if( cur.isBinary() ) {
            it.next();
            const arg1= this.loadSimpleExp( it );
            const arg2= this.loadSimpleExp( it );
            return new MathBinaryCommand( it, cur, arg1, arg2 );
          }
        }

        // Ensure iter moved
        it.next();

        // v | other?
        return cur;
      }

      loadIntExp( it ) {
        const Syms= Renderer.defs.symbolTable;
        const e= this.loadSimpleExp( it );

        let sub= null, sup= null;

        // Try to load sub
        let s= it.get();
        if( s.isSym( Syms.sub ) ) {
          it.next();
          sub= this.loadSimpleExp( it );
        }

        // Try to load sup
        s= it.get();
        if( s.isSym( Syms.sup ) ) {
          it.next();
          sup= this.loadSimpleExp( it );
        }

        // S_S | S^S | S_S^S
        if( sub || sup ) {
          return new MathIntExpression( e, sub, sup );

        // S
        } else {
          return e;
        }
      }

      loadExp( it ) {
        const Syms= Renderer.defs.symbolTable;

        while( !it.isEnd() && !this.shouldStop( it ) ) {
          const se= this.loadIntExp( it );

          if( se ) {
            // Try to load fraction
            const sym= it.get();
            if( sym && sym.isSym( Syms.fracDiv ) ) {

              // I/I
              it.next();
              const denom= this.loadIntExp( it );
              if( denom ) {
                this.children.push( new MathFraction( se, denom ) );

              // I/
              } else {
                this.children.push( se );
                this.children.push( sym );
              }

            // I
            } else {
              this.children.push( se );
            }
          }
        }
      }
    }

    class MathUnaryCommand extends MathSymbol {
      constructor( msym, arg ) {
        super( msym.sym );
        this.argA= this.wrapArgument( arg );
      }

      wrapArgument( a, def ) {
        if( !a || a instanceof MathExpression ) {
          return a;
        }

        return new MathExpression( a );
      }

      static create() {
        // return sqrt
      }
    }

    class MathBinaryCommand extends MathUnaryCommand {
      constructor( msym, argA, argB ) {
        super( msym, argA );
        this.argB= this.wrapArgument( argB );;
      }

      static create() {
        // return root, fraction
      }
    }

    class MathParenthesis extends MathExpression {
      constructor( it ) {
        super( it );

        this.closePar= it.get();
        it.next();
      }

      init( it ) {
        this.openPar= it.get();
        it.next();
      }

      shouldStop( it ) {
        const cur= it.get();
        if( cur instanceof MathSymbol ) {
          return cur.isParClose();
        }

        return false;
      }
    }

    class MathIntExpression extends MathElement {
      constructor( e, sub, sup ) {
        super();
        this.exp= e;
        this.sub= sub;
        this.sup= sup;
      }
    }

    class MathFraction extends MathElement {
      constructor( num, denom ) {
        super();
        this.num= num;
        this.denom= denom;
      }
    }


    /*
    *
    *
    */
    class Renderer {
      constructor() {
        Renderer.moduleInit();
      }

      static moduleInit() {
        if( !Renderer.hasInit ) {
          Renderer.initSymbolTable();
          Renderer.initRegex();

          Renderer.hasInit= true;
        }
      }

      static initSymbolTable() {
        // Create table of name to object
        const symbols= Renderer.defs.symbols;
        const table=   Renderer.defs.symbolTable;
        symbols.forEach( s => table[s.name]= s );

        // Set default symbol parenthesis type
        symbols.forEach( s => s.exp= s.hasOwnProperty('exp') ? s.exp : Renderer.ParType.None );

        // Set default symbol unary/binary props
        symbols.forEach( s => {
          s.unary||= false;
          s.binary||= false;
        });

        // Set symbol bracket links
        symbols.forEach( s => {
          const name= s.rpar;
          if( name ) {
            if( !table.hasOwnProperty( name ) ) {
              throw Error( 'Unknown right parenthesis symbol: '+ name );
            }

            s.rpar= table[name];
            s.exp= true;
          }
        });
      }

      static initRegex() {
        const symbols= Renderer.defs.symbols;

        // Create regex for symbols as ascii and tex
        const ascii= Renderer.ascii= ParserRegex.build( symbols, 'ascii' );
        const tex=   Renderer.tex=   ParserRegex.build( symbols, 'tex' );

        // Build large tokenizer regex
        let large='';
        large+= ascii.grouplessSource( 'ascii' )+ '|';
        large+= '(?<str>"[^"]*")|(?<num>\\d+)|';
        large+= tex.grouplessSource( 'tex' )+ '|';
        large+= `(?<str2>\\w)`;

        Renderer.tokenize= new ParserRegex( large ); console.log( large );
      }

      _tokenize( source ) {
        const tokens= [];

        // Iterate over all token matches
        for( let tk of Renderer.tokenize.match( source ) ) {
          const g= tk.groups;
          if( g.ascii ) {
            const sym= Renderer.ascii.matchLookup( tk[0] );
            if( !sym ) {
              throw SyntaxError( source, tk.index, 'Unknown ascii symbol.' );
            }

            // Create symbol
            tokens.push( new MathSymbol( sym ) );

          } else if( g.num ) {

            // Create number
            tokens.push( new MathNumber( tk[0] ) );

          } else if( g.tex ) {
            const sym= Renderer.tex.matchLookup( tk[0] );
            if( !sym ) {
              throw SyntaxError( source, tk.index, 'Unknown tex symbol.' );
            }

            // Create symbol
            tokens.push( new MathSymbol( sym ) );

          } else if( g.str || g.str2 ) {

            // Create variable
            tokens.push( new MathVariable( tk[0] ) );

          } else {
            throw Error( 'Unknown token '+ tk[0] );
          }
        }

        return tokens;
      }

      fromASCII( source ) {
        //(\*\*\*|\*\*|\*|\/\/|\/_\\|\/_|\|__|__\||\|~|~\||\\\\|\-\:|\+\-|\|\>\<|\>\<\||\|\>\<\||\/|\=|\(|\)|\+|\-|\_|@|o\+|o\.|\^\^\^|\^\^|\^|O\/|\:\.|\:\'|\|\.\.\.\|)|(\"[^"]*\")|(\d+)|(\w+?(?=(_|ox|times)))|(ox|times)|(\w+)

        // Early return
        if( typeof source !== 'string' || !source.length ) {
          return;
        }

        const tokens= this._tokenize( source );
        const it= new ArrayIterator( tokens );

        const root= new MathExpression( it );

        console.log( tokens );
        console.log( root );
      }
    }

    Renderer.hasInit= false;
    Renderer.ParType= {
      None:  0,
      Open:  1,
      Close: 2
    };

    Renderer.defs= {
      symbols: [
        // Operations Symbols
        { name: 'plus',      ascii: '+',    symbol: '+',  tex: null },
        { name: 'minus',     ascii: '-',    symbol: '−',  tex: null },
        { name: 'cdot',      ascii: '*',    symbol: '⋅',  tex: ['cdot'] },
        { name: 'ast',       ascii: '**',   symbol: '∗',  tex: ['ast'] },
        { name: 'star',      ascii: '***',  symbol: '⋆',  tex: ['star'] },
        { name: 'slash',     ascii: '//',   symbol: '/',  tex: null },
        { name: 'backslash', ascii: '\\\\', symbol: '\\', tex: ['backslash', 'setminus'] },
        { name: 'times',     ascii: null,   symbol: '×',  tex: ['xx', 'times'] },
        { name: 'div',       ascii: '-+',   symbol: '÷',  tex: ['div'] },
        { name: 'ltimes',    ascii: '|><',  symbol: '÷',  tex: ['ltimes'] },
        { name: 'rtimes',    ascii: '><|',  symbol: '÷',  tex: ['rtimes'] },
        { name: 'bowtie',    ascii: '|><|', symbol: '÷',  tex: ['bowtie'] },
        { name: 'circ',      ascii: '@',    symbol: '∘',  tex: ['circ'] },
        { name: 'oplus',     ascii: 'o+',   symbol: '⊕',  tex: ['oplus'] },
        { name: 'otimes',    ascii: null,   symbol: '⊗',  tex: ['ox', 'otimes'] },
        { name: 'odot',      ascii: 'o.',   symbol: '⊙',  tex: ['odot'] },
        { name: 'sum',       ascii: null,   symbol: '∑',  tex: ['sum'] },
        { name: 'prod',      ascii: null,   symbol: '∏',  tex: ['prod'] },
        { name: 'wedge',     ascii: '^^',   symbol: '∧',  tex: ['wedge'] },
        { name: 'bigwedge',  ascii: '^^^',  symbol: '⋀',  tex: ['bigwedge'] },
        { name: 'vee',       ascii: null,   symbol: '∨',  tex: ['vv', 'vee'] },
        { name: 'bigvee',    ascii: null,   symbol: '⋁',  tex: ['vvv', 'bigvee'] },
        { name: 'cap',       ascii: null,   symbol: '∩',  tex: ['nn', 'cap'] },
        { name: 'bigcap',    ascii: null,   symbol: '⋂',  tex: ['nnn', 'bigcap'] },
        { name: 'cup',       ascii: null,   symbol: '∪',  tex: ['uu', 'cup'] },
        { name: 'bigcup',    ascii: null,   symbol: '⋃',  tex: ['uuu', 'bigcup'] },

        // Miscellaneous Symbols
        { name: 'fracDiv',   ascii: '/',    symbol: '/',  tex: null },
        { name: 'frac',      ascii: null,   symbol: null, tex: ['frac'], binary: true },
        { name: 'sup',       ascii: '^',    symbol: null, tex: null },
        { name: 'sub',       ascii: null,   symbol: null, tex: '_' },
        { name: 'sqrt',      ascii: null,   symbol: '√',  tex: ['sqrt'], unary: true },
        { name: 'root',      ascii: null,   symbol: '√',  tex: ['root'], binary: true},
        { name: 'int',       ascii: null,   symbol: '∫',  tex: ['int'] },
        { name: 'oint',      ascii: null,   symbol: '∮',  tex: ['oint'] },
        { name: 'del',       ascii: null,   symbol: '∂',  tex: ['del', 'partial'] },
        { name: 'grad',      ascii: null,   symbol: '∇',  tex: ['grad', 'nabla'] },
        { name: 'pm',        ascii: '+-',   symbol: '±',  tex: ['pm'] },
        { name: 'emptyset',  ascii: 'O/',   symbol: '∅',  tex: ['emptyset'] },
        { name: 'infinity',  ascii: null,   symbol: '∞',  tex: ['infty'] },
        { name: 'aleph',     ascii: null,   symbol: 'ℵ',  tex: ['aleph'] },

        // Relation Symbols
        { name: 'equal',     ascii: '=',    symbol: '=',  tex: null },

        // Grouping Symbols
        { name: 'parOpen',   ascii: '(',    symbol: '(',  tex: null, exp: Renderer.ParType.Open },
        { name: 'parClose',  ascii: ')',    symbol: ')',  tex: null, exp: Renderer.ParType.Close },
        { name: 'braOpen',   ascii: '[',    symbol: '[',  tex: null, exp: Renderer.ParType.Open },
        { name: 'braClose',  ascii: ']',    symbol: ']',  tex: null, exp: Renderer.ParType.Close },
        { name: 'curOpen',   ascii: '{',    symbol: '{',  tex: null, exp: Renderer.ParType.Open },
        { name: 'curClose',  ascii: '}',    symbol: '}',  tex: null, exp: Renderer.ParType.Close },
      ],
      symbolTable: {}
    };

    return Renderer;
  }


  // Check for common js module
  if( typeof module === 'object' && typeof module.exports === 'object' ) {
    module.exports= moduleWrapper;
  } else {

    // Add to global if browser
    if( typeof window !== 'undefined' ) {
      if( !window.hasOwnProperty('smrConfig') ) {
        window.smrConfig= {};
      }

      window.smrConfig.Renderer= moduleWrapper( window.smrConfig );

    }
  }
})();