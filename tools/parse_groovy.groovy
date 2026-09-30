// Parse every Groovy script passed as an argument (syntax / structure smoke test).
// Compiles only up to the CONVERSION phase: the scripts are parsed to an AST
// without resolving (or needing) the NoiseModelling classes, so no classpath is
// required. This catches syntax errors and unbalanced edits.
import org.codehaus.groovy.control.CompilationUnit
import org.codehaus.groovy.control.Phases

def failed = 0
args.each { p ->
    try {
        def cu = new CompilationUnit()
        cu.addSource(new File(p))
        cu.compile(Phases.CONVERSION)
        println "OK   ${p}"
    } catch (Throwable t) {
        failed++
        System.err.println "FAIL ${p}: ${t.message}"
    }
}
System.exit(failed == 0 ? 0 : 1)
