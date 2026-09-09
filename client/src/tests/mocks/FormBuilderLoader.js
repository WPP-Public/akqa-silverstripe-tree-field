import React from 'react';

// Stands in for the CMS form schema loader: renders enough to assert which record is loaded
const FormBuilderLoader = ({ identifier, schemaUrl }) => (
  <div data-testid="form-builder" data-identifier={identifier} data-schema-url={schemaUrl} />
);

export default FormBuilderLoader;
