(function() {
  const DefaultException= (function() {
    class DefaultException {
      constructor( str, i, m= null ) {
        this.str= str;
        this.pos= i;
        this.txt= m;
        this.err= Error();
      }

      msg() {
        let s= this.txt+ '\n';
        s+= this.str+ '\n';
        return s+ ''.padStart(this.pos, '~') + '^';
      }

      print() {
        console.error( this.msg() );
      }

      trace() {
        const stack= this.err.stack;
        return stack; // TODO: Remove the first two lines
      }
    }

    const func= function( str, i, m ) {
      return new DefaultException( str, i, m );
    };
    func._type= DefaultException;

    return func;
  })();

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

  class StringRef {
    constructor( s= '' ) {
      this.str= s;
    }

    get() { return this.str; }

    append( s ) {
      if( s instanceof StringRef ) {
        this.str+= s.str;
      } else {
        this.str+= s+ (s.length ? '\n' : '');
      }
      return this;
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
    * Parsing ASCII math based on this definition: http://asciimath.org/
    *
    *  v ::= [A-Za-z] | greek letters | numbers | other constant symbols
    *  u ::= sqrt | text | bb | other unary symbols for font commands
    *  b ::= frac | root | stackrel | other binary symbols
    *  l ::= ( | [ | { | (: | {: | other left brackets
    *  r ::= ) | ] | } | :) | :} | other right brackets
    *  S ::= v | lEr | uS | bSS             Simple expression
    *  I ::= S_S | S^S | S_S^S | S          Intermediate expression
    *  E ::= IE | I/I                       Expression
    */

    /*
    * Math Element Class
    * Node of a math markup tree. Represents a section in a mathematical
    * formula. Implements parsing and printing.
    */
    class MathElement {
      constructor() {}

      wrapArg( a ) {
        if( !a || (a instanceof MathExpression)  ) {
          // Replace parenthesis with expression
          if( a instanceof MathParenthesis ) {
            return new MathExpression( a );
          }
          return a;
        }

        return new MathExpression( a );
      }

      isSym( symbol ) { return false; }

      printHTML( str ) { throw Error('Abstract'); }

      static wrapRoot( str, func= null, gridFull= false ) {
        const exp= Renderer._getContext()._getCurExp();
        let lev= exp.rootLevel;

        // Additional attribute to span both grid rows
        const openTag= gridFull ? '<m-rtstem r="2"' : '<m-rtstem';

        // Additional attribute for the first opentag of the first root stem element
        let topLevel= '';
        if( lev && !exp.rootStemHasElements ) {
          exp.rootStemHasElements= true;
          str.append( openTag+ ' start>' );
          lev--;
        }

        // All remaining nested root stems
        str.append( (openTag+ '>').repeat(lev) );

        if( func ) {
          func();
        }

        str.append( '</m-rtstem>'.repeat(lev) );
      }
    }

    class MathLineElement extends MathElement {
      constructor() {
        super();
      }

      printHTML( str ) {
        const tagName= this.getTagName();

        this.printWithTagName( str, tagName );
      }

      printWithTagName( str, tag, addSpacer= true ) {
        // Add spacer before element to begin root stem before element
        if( addSpacer ) {
          // Add spacer with root stem lines
          str.append( '<m-spacer r="1">' );
          MathElement.wrapRoot( str );
          str.append( '</m-spacer>' );
        }

        // Print boilerplate
        str.append('<'+ tag+ '><span>');

        // Print body
        this.printBody( str );

        str.append('</span></'+ tag+ '>');
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

      isUnary() { return this.sym.cmd === Renderer.CmdType.Unary; }

      isBinary() { return this.sym.cmd === Renderer.CmdType.Binary; }

      getTagName() {
        if( this.sym.cmd === Renderer.CmdType.Function ) {
          return 'm-nm';
        }

        return 'm-op';
      }

      printBody( str ) {
        str.append( this.sym.glyph );
      }
    }

    class MathVariable extends MathLineElement {
      constructor( s ) {
        super();
        this.text= s;
      }

      getTagName() {
        return 'm-var';
      }

      printBody( str ) {
        str.append( this.text );
      }
    }

    class MathNumber extends MathLineElement {
      constructor( s ) {
        super();
        this.num= s;
      }

      getTagName() {
        return 'm-nm';
      }

      printBody( str ) {
        str.append( this.num );
      }
    }

    class MathExpression extends MathElement {
      constructor( it ) {
        super();

        this.children= [];
        this.rootLevel= 0;
        this.rootStemHasElements= false;

        if( it instanceof MathExpression ) {
          this.children= it.children;

        } else if( it instanceof MathElement ) {
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
            return MathUnaryCommand.create( cur, arg );

          // bSS
          } else if( cur.isBinary() ) {
            it.next();
            const arg1= this.loadSimpleExp( it );
            const arg2= this.loadSimpleExp( it );
            return MathBinaryCommand.create( cur, arg1, arg2 );
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
        if( s && s.isSym( Syms.sub ) ) {
          it.next();
          sub= this.loadSimpleExp( it );
        }

        // Try to load sup
        s= it.get();
        if( s && s.isSym( Syms.sup ) ) {
          it.next();
          sup= this.loadSimpleExp( it );
        }

        // S_S | S^S | S_S^S
        if( sub || sup ) {
          return MathIntExpression.create( e, sub, sup );

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

      printChildren( str ) {
        this.children.forEach( c => c.printHTML( str ) );
      }

      printHTML( str ) {
        const ctx= Renderer._getContext();
        ctx._pushExp( this );

        str.append('<m-expr>');
        this.printChildren( str );
        str.append('</m-expr>');

        ctx._popExp();
      }
    }

    class MathParenthesis extends MathExpression {
      constructor( it ) {
        super( it );

        // Get id from renderer context
        const d= Renderer._getContext().parsingData;
        d.parIdCtr= d.parIdCtr || 0;

        this.id= d.parIdCtr++;

        // Try to load the close par element
        this.closePar= it.isEnd() ? null : it.get();
        it.next();

        if( !(this.openPar instanceof MathSymbol) || (this.closePar && !(this.closePar instanceof MathSymbol)) ) {
          throw Error('MathParenthesis open/close par element is not a symbol');
        }
      }

      init( it ) {
        this.openPar= it.get();
        it.next();
      }

      shouldStop( it ) {
        // Stop if a closing par element is found
        const cur= it.get();
        if( cur instanceof MathSymbol ) {
          return cur.isParClose();
        }

        return false;
      }

      printHTML( str ) {
        MathElement.wrapRoot( str, () => {
          // Print opening par element with id if closing one exists
          if( this.closePar ) {
              str.append('<m-par open="'+ this.id+ '"><div>')
          } else {
              str.append('<m-par><div>')
          }

          str.append( this.openPar.sym.glyph );
          str.append('</div></m-par>');
        }, true);

        this.printChildren( str );

        // Print closing par element
        if( this.closePar ) {
          MathElement.wrapRoot( str, () => {
            str.append('<m-par close="'+ this.id+ '"><div>')
            str.append( this.closePar.sym.glyph );
            str.append('</div></m-par>')
          }, true);
        }
      }
    }

    class MathUnaryCommand extends MathSymbol {
      constructor( msym, arg ) {
        super( (msym instanceof MathSymbol) ? msym.sym : msym );
        this.argA= this.wrapArg( arg );
      }

      static create( msym, arg ) {
        const Symbols= Renderer.defs.symbolTable;

        // Create special unary command element
        if( msym.sym === Symbols.sqrt ) {
          return new MathRoot( null, arg );
        } // else if text, bb, etc.

        // Create generic element
        return new MathUnaryCommand( msym, arg );
      }

      printHTML() {
        console.log('unary command');
      }
    }

    class MathBinaryCommand extends MathUnaryCommand {
      constructor( msym, argA, argB, wrapB= true ) {
        super( msym, argA );

        this.argB= wrapB ? this.wrapArg( argB ) : argB;
      }

      static create( msym, argA, argB ) {
        const Symbols= Renderer.defs.symbolTable;

        // Create special binary command element
        if( msym.sym === Symbols.root ) {
          return new MathRoot( argA, argB );

        } else if( msym.sym === Symbols.frac ) {
          return new MathFraction( argA, argB );
        }

        // Create generic element
        return new MathBinaryCommand( msym, argA, argB );
      }

      printHTML() {
        console.log('binary command');
      }
    }

    class MathRoot extends MathBinaryCommand {
      constructor( exponent, radicand ) {
        // Don't wrap the radicand
        super( Renderer.defs.symbolTable.root, exponent, radicand, false );

        // Square root by default
        if( !this.argA ) {
          this.argA= this.wrapArg( new MathNumber('2') );
        }
      }

      printHTML( str ) {
        // Print exponent as leading sup exp
        MathIntExpression.printSupElem( this.argA, str, true, ['<m-sup root><div>', '</div></m-sup>'] );

        // Print self as MathSymbol with custom tag name
        this.printWithTagName( str, 'm-rt' );

        // Increase root level of the current expression
        const parent= Renderer._getContext()._getCurExp();
        parent.rootLevel++;

        // Only print children if radicant is paranthesis
        if( this.argB instanceof MathParenthesis ) {
          this.argB.children.forEach( c => {
            c.printHTML( str );
          });
        } else {
          this.argB.printHTML( str );
        }

        if( --parent.rootLevel === 0 ) {
          parent.rootStemHasElements= false;
        }
      }
    }

    class MathIntExpression extends MathElement {
      constructor( e, sub, sup ) {
        super();
        this.exp= e;
        this.sub= this.wrapArg(sub);
        this.sup= this.wrapArg(sup);
      }

      static create( e, sub, sup ) {
        const Symbols= Renderer.defs.symbolTable;

        if( e instanceof MathSymbol ) {
          switch( e.sym ) {
            case Symbols.sum:
            case Symbols.prod:
            case Symbols.int:
              return new MathSumExpression( e, sub, sup );

            default:
              break;
          }
        }

        return new MathIntExpression( e, sub, sup );
      }

      static printSupElem( e, str, addSpacer= true, lines= [null, null] ) {
        // Print root stem
        MathElement.wrapRoot( str, () => {
          // Print element with provided or default wrapper element
          str.append(lines[0] || '<m-sup><div>');
          if( e ) {
            e.printHTML( str );
          }
          str.append(lines[1] || '</div></m-sup>');
        });

        // Add optional spacer
        if( addSpacer ) {
          str.append('<m-spacer r="2"></m-spacer>');
        }
      }

      printExp( str ) {
        this.exp.printHTML( str );
      }

      printSub( str ) {
        str.append('<m-sub>');
        this.sub.printHTML( str );
        str.append('</m-sub>');
      }

      printSup( str ) {
        // Add no spacer by default
        MathIntExpression.printSupElem( this.sup, str, false );
      }

      printHTML( str ) {
        this.printExp( str );

        // Print sub exp or a spacer instead
        if( this.sub ) {
          this.printSub( str );
        } else {
          str.append('<m-spacer r="2"></m-spacer>');
        }

        // Print sup exp or spacer
        if( this.sup ) {
          this.printSup( str );
        } else {
          str.append('<m-spacer r="1"></m-spacer>');
        }
      }
    }

    class MathSumExpression extends MathIntExpression {
      constructor( e, sub, sup ) {
        super( e, sub, sup );
      }

      printExp( str ) {
        this.exp.printWithTagName( str, 'm-sum', false );
      }

      printSub( str ) {
        // Print sums lower bound
        str.append('<m-lbnd><div>');
        this.sub.printHTML( str );
        str.append('</div></m-lbnd>');
      }

      printSup( str ) {
        // Print sums upper bound
        MathIntExpression.printSupElem( this.sup, str, false, ['<m-ubnd>', '</m-ubnd>'] );
      }
    }

    class MathFraction extends MathElement {
      constructor( num, denom ) {
        super();
        this.num=   this.wrapArg(num);
        this.denom= this.wrapArg(denom);
      }

      printHTML( str ) {
        // Print numerator as sup element
        MathIntExpression.printSupElem( this.num, str, false, ['<m-num><div>', '</div></m-num>'] );

        // Print denominator
        str.append('<m-denom>');
        if( this.denom ) {
          this.denom.printHTML( str );
        }
        str.append('</m-denom>');
      }
    }


    /*
    * Renderer Class
    * Converts markup source into html
    * The instance can be thrown away, as any initialization will be done once
    * globally.
    */
    class Renderer {
      constructor() {
        Renderer._moduleInit();

        this.root= null;
        this.parsingData= {};
        this.expStack= [];
      }

      static _moduleInit() {
        if( !Renderer.hasInit ) {
          Renderer._initSymbolTable();
          Renderer._initRegex();

          Renderer.hasInit= true;
        }
      }

      static _initSymbolTable() {
        const symbols= Renderer.defs.symbols;

        // Set default flags
        symbols.forEach( (s, i) => {
          symbols[i]= Object.assign({
            exp: Renderer.ParType.None,
            cmd: Renderer.CmdType.None
          }, s);
        });

        // Create table of name to object
        // After flags as assign replaces the obj
        const table=   Renderer.defs.symbolTable;
        symbols.forEach( s => table[s.name]= s );


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

      static _initRegex() {
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

      static _getContext() {
        return Renderer.activeContext;
      }

      _setActive( v= true ) {
        Renderer.activeContext= v ? this : null;
      }

      _pushExp( e ) {
        this.expStack.push( e );
      }

      _popExp() {
        this.expStack.pop();
      }

      _getCurExp() {
        // Get top of expression stack
        const len= this.expStack.length;
        return len ? this.expStack[ len -1 ] : null;
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

        this._setActive();

        this.parsingData= {};

        // Early return
        if( typeof source !== 'string' || !source.length ) {
          return;
        }

        const tokens= this._tokenize( source );
        const it= new ArrayIterator( tokens );

        this.root= new MathExpression( it );

        console.log( tokens );
        console.log( this.root );

        this._setActive( false );
      }

      printHTML() {
        this._setActive();

        this.expStack.length= 0;

        const str= new StringRef();

        str.append('<m-math>');
        this.root.printHTML( str );
        str.append('</m-math>');

        this._setActive( false );

        return str.get();
      }
    }

    Renderer.activeContext= null;
    Renderer.hasInit= false;
    Renderer.ParType= {
      None:  0,
      Open:  1,
      Close: 2
    };
    Renderer.CmdType= {
      None: 0,
      Unary: 1,
      Binary: 2,
      Function: 3
    };

    Renderer.defs= {
      symbols: [
        // Operations Symbols
        { name: 'plus',      ascii: '+',    glyph: '+',  tex: null },
        { name: 'minus',     ascii: '-',    glyph: '−',  tex: null },
        { name: 'cdot',      ascii: '*',    glyph: '⋅',  tex: ['cdot'] },
        { name: 'ast',       ascii: '**',   glyph: '∗',  tex: ['ast'] },
        { name: 'star',      ascii: '***',  glyph: '⋆',  tex: ['star'] },
        { name: 'slash',     ascii: '//',   glyph: '/',  tex: null },
        { name: 'backslash', ascii: '\\\\', glyph: '\\', tex: ['backslash', 'setminus'] },
        { name: 'times',     ascii: null,   glyph: '×',  tex: ['xx', 'times'] },
        { name: 'div',       ascii: '-+',   glyph: '÷',  tex: ['div'] },
        { name: 'ltimes',    ascii: '|><',  glyph: '÷',  tex: ['ltimes'] },
        { name: 'rtimes',    ascii: '><|',  glyph: '÷',  tex: ['rtimes'] },
        { name: 'bowtie',    ascii: '|><|', glyph: '÷',  tex: ['bowtie'] },
        { name: 'circ',      ascii: '@',    glyph: '∘',  tex: ['circ'] },
        { name: 'oplus',     ascii: 'o+',   glyph: '⊕',  tex: ['oplus'] },
        { name: 'otimes',    ascii: null,   glyph: '⊗',  tex: ['ox', 'otimes'] },
        { name: 'odot',      ascii: 'o.',   glyph: '⊙',  tex: ['odot'] },
        { name: 'sum',       ascii: null,   glyph: '∑',  tex: ['sum'] },
        { name: 'prod',      ascii: null,   glyph: '∏',  tex: ['prod'] },
        { name: 'wedge',     ascii: '^^',   glyph: '∧',  tex: ['wedge'] },
        { name: 'bigwedge',  ascii: '^^^',  glyph: '⋀',  tex: ['bigwedge'] },
        { name: 'vee',       ascii: null,   glyph: '∨',  tex: ['vv', 'vee'] },
        { name: 'bigvee',    ascii: null,   glyph: '⋁',  tex: ['vvv', 'bigvee'] },
        { name: 'cap',       ascii: null,   glyph: '∩',  tex: ['nn', 'cap'] },
        { name: 'bigcap',    ascii: null,   glyph: '⋂',  tex: ['nnn', 'bigcap'] },
        { name: 'cup',       ascii: null,   glyph: '∪',  tex: ['uu', 'cup'] },
        { name: 'bigcup',    ascii: null,   glyph: '⋃',  tex: ['uuu', 'bigcup'] },

        // Miscellaneous Symbols
        { name: 'fracDiv',   ascii: '/',    glyph: '/',  tex: null },
        { name: 'frac',      ascii: null,   glyph: null, tex: ['frac'], cmd: Renderer.CmdType.Binary },
        { name: 'sup',       ascii: '^',    glyph: null, tex: null },
        { name: 'sub',       ascii: null,   glyph: null, tex: '_' },
        { name: 'sqrt',      ascii: null,   glyph: '√',  tex: ['sqrt'], cmd: Renderer.CmdType.Unary },
        { name: 'root',      ascii: null,   glyph: '√',  tex: ['root'], cmd: Renderer.CmdType.Binary },
        { name: 'int',       ascii: null,   glyph: '∫',  tex: ['int'] },
        { name: 'oint',      ascii: null,   glyph: '∮',  tex: ['oint'] },
        { name: 'del',       ascii: null,   glyph: '∂',  tex: ['del', 'partial'] },
        { name: 'grad',      ascii: null,   glyph: '∇',  tex: ['grad', 'nabla'] },
        { name: 'pm',        ascii: '+-',   glyph: '±',  tex: ['pm'] },
        { name: 'emptyset',  ascii: 'O/',   glyph: '∅',  tex: ['emptyset'] },
        { name: 'infinity',  ascii: null,   glyph: '∞',  tex: ['infty'] },
        { name: 'aleph',     ascii: null,   glyph: 'ℵ',  tex: ['aleph'] },

        // Relation Symbols
        { name: 'equal',     ascii: '=',    glyph: '=',  tex: null },

        // Grouping Symbols
        { name: 'parOpen',   ascii: '(',    glyph: '(',  tex: null, exp: Renderer.ParType.Open },
        { name: 'parClose',  ascii: ')',    glyph: ')',  tex: null, exp: Renderer.ParType.Close },
        { name: 'braOpen',   ascii: '[',    glyph: '[',  tex: null, exp: Renderer.ParType.Open },
        { name: 'braClose',  ascii: ']',    glyph: ']',  tex: null, exp: Renderer.ParType.Close },
        { name: 'curOpen',   ascii: '{',    glyph: '{',  tex: null, exp: Renderer.ParType.Open },
        { name: 'curClose',  ascii: '}',    glyph: '}',  tex: null, exp: Renderer.ParType.Close },
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
