import {readFileSync} from 'node:fs'

// Approved PUBLIC release configuration. Never an application/runtime fallback.
export function publicBuildConfig(file,environment=process.env){
  const config=JSON.parse(readFileSync(file,'utf8'))
  const approved={H2O_TYPEFORM_FORM_ID:'F22cAgx3',H2O_TYPEFORM_ORIGIN:'https://form.typeform.com'}
  for(const [key,value] of Object.entries(approved)){
    if(config[key]!==value)throw new Error(`Public release configuration missing or mismatched: ${key}`)
    if(environment[key]!==undefined&&environment[key]!==value)throw new Error(`Conflicting public release environment: ${key}`)
  }
  return approved
}
