import jQuery from 'jquery';
import React from 'react';
import ReactDomClient from 'react-dom/client';
import { loadComponent } from 'lib/Injector';

/**
 * Mounts the TreeField component when the surrounding form is rendered as plain HTML rather than
 * through the React form schema, which is what GridField detail forms still do.
 *
 * The props come off the hidden input's data attributes, which the PHP field fills in.
 */
jQuery.entwine('ss', ($) => {
  $('.js-injector-boot .entwine-treefield').entwine({
    Component: null,
    Root: null,

    onmatch() {
      const context = this.closest('.cms-content').attr('id');
      const componentName = this.data('schema-component');
      const component = loadComponent(componentName, context ? { context } : {});

      this.setComponent(component);
      this.setRoot(ReactDomClient.createRoot(this[0]));
      this._super();
      this.refresh();
    },

    refresh() {
      const Component = this.getComponent();

      this.getRoot().render(React.createElement(Component, this.getProps()));
    },

    getInputField() {
      return $(`#${this.data('field-id')}`);
    },

    getProps() {
      const input = this.getInputField();

      // jQuery.data() coerces attribute values, so anything that must stay a string is cast back
      return {
        urls: input.data('urls') || {},
        securityID: String(input.data('security-id') || ''),
        maxDepth: parseInt(input.data('max-depth'), 10) || 0,
        labels: input.data('labels') || {},
        showDetail: !!input.data('show-detail'),
        readonly: !!input.data('readonly'),
        disabled: !!input.data('disabled'),
        canAdd: !!input.data('can-add'),
        noHolder: true,
      };
    },

    onunmatch() {
      const root = this.getRoot();

      if (root) {
        root.unmount();
      }
    },
  });
});
